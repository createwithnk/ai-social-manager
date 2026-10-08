"""Live AI/Auth or closed-service regression using a disposable fixture account.

The caller provisions and removes the fixture through an authorized admin flow.
Default mode logs in twice and tests AI validation/quota/revocation. The
services-only mode checks closed account/payment gates and revoked sessions.
Neither mode uploads media, sends email, requests Gemini, takes payment or publishes.
Only status/check names enter the report; passwords and JWTs stay in memory.
"""
import argparse
import concurrent.futures
import datetime
import json
import urllib.error
import urllib.request
from pathlib import Path


class RejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--services-only', action='store_true')
    args = parser.parse_args()
    fixture = json.loads(Path(args.credentials).read_text())
    user = fixture['user']
    assert user['email'].endswith('@example.invalid')
    assert fixture['run'] in user['email']
    config = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    root = config['VITE_SUPABASE_URL'].strip().strip('"').strip("'")
    assert root == 'https://nkfecpdegcmsapvbviky.supabase.co'
    key = config['VITE_SUPABASE_ANON_KEY'].strip().strip('"').strip("'")
    opener = urllib.request.build_opener(RejectRedirect())
    report = {'verified_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'project_ref': 'nkfecpdegcmsapvbviky', 'fixture_run': fixture['run'],
              'checks': [], 'provider_calls_requested': False, 'uploads_requested': False,
              'email_sent': False, 'website_or_social_publication': False,
              'payment_transaction': False, 'cleanup_verified': False,
              'scope': 'closed account/payment services' if args.services_only else 'AI/Auth regression'}

    def call(path, method='POST', body=None, token=None, origin=None):
        headers = {'apikey': key}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if origin:
            headers['Origin'] = origin
        if body is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(root + path, data=json.dumps(body).encode() if body is not None else None,
                                     headers=headers, method=method)
        try:
            with opener.open(req, timeout=20) as response:
                status, data = response.status, response.read(65536)
        except urllib.error.HTTPError as error:
            status, data = error.code, error.read(65536)
        try:
            return status, json.loads(data) if data else None
        except json.JSONDecodeError:
            return status, None

    def check(name, passed):
        report['checks'].append({'name': name, 'passed': bool(passed)})
        print(json.dumps({'check': name, 'passed': bool(passed)}), flush=True)
        if not passed:
            raise AssertionError(name)

    brief = {'idea': 'A fictional small business brief for access testing only.',
             'platform': 'Instagram', 'tone': 'Friendly', 'language': 'Hindi'}
    tokens = []
    try:
        if args.services_only:
            status, data = call('/auth/v1/token?grant_type=password', body={'email': user['email'], 'password': user['password']})
            check('confirmed service fixture login', status == 200 and isinstance(data, dict) and data.get('user', {}).get('id') == user['id'])
            token = data['access_token']
            for name in ['social-account', 'payment-checkout']:
                status, _ = call('/functions/v1/' + name, body={'action': 'status'})
                # A closed billing gate returns 423 before inspecting login;
                # when billing is enabled, the actual handler tests require 401.
                denied = status == 401 or (name == 'payment-checkout' and status == 423)
                check(name + ' denies anonymous caller', denied)
            status, data = call('/functions/v1/social-account', body={'action': 'status'}, token=token, origin='http://localhost:5173')
            check('account status safely reports pending setup and publishing disabled', status == 200 and data == {'instagram': False, 'linkedin': False, 'publishing': False})
            for provider in ['instagram', 'linkedin']:
                status, _ = call('/functions/v1/social-account', body={'action': 'start', 'provider': provider}, token=token, origin='http://localhost:5173')
                check(provider + ' cannot connect before setup', status == 503)
            for action in ['plans', 'checkout']:
                status, _ = call('/functions/v1/payment-checkout', body={'action': action, 'planId': 'fixture'}, token=token, origin='http://localhost:5173')
                check('disabled billing blocks ' + action, status == 423)
            status, _ = call('/functions/v1/payment-webhook', body={'event': 'payment_link.paid'})
            check('disabled webhook rejects event without creating credits', status == 423)
            status, _ = call('/functions/v1/social-callback', 'GET')
            check('OAuth callback without state/code cannot connect an account', status in (303, 503))
            status, _ = call('/auth/v1/logout?scope=global', token=token)
            check('service fixture global logout succeeds', status == 204)
            status, _ = call('/functions/v1/social-account', body={'action': 'status'}, token=token, origin='http://localhost:5173')
            check('social metadata denies old token after logout', status == 401)
            return 0
        for index in range(2):
            status, data = call('/auth/v1/token?grant_type=password', body={'email': user['email'], 'password': user['password']})
            check('fixture login ' + str(index + 1), status == 200 and isinstance(data, dict) and data.get('user', {}).get('id') == user['id'])
            tokens.append(data['access_token'])
        check('separate fixture sessions issued', tokens[0] != tokens[1])
        status, data = call('/auth/v1/user', 'GET', token=tokens[0])
        check('verified fixture Auth identity', status == 200 and isinstance(data, dict) and data.get('id') == user['id'])
        for index, token in enumerate(tokens):
            status, data = call('/rest/v1/rpc/has_active_session', body={}, token=token)
            check('active fixture session ' + str(index + 1), status == 200 and data is True)
        status, data = call('/rest/v1/rpc/launch_status', body={}, token=tokens[0])
        check('publishing and billing both disabled', status == 200 and isinstance(data, dict) and data.get('publishing') is False and data.get('billing') is False)
        status, _ = call('/functions/v1/generate-content', body=brief)
        check('AI denies unauthenticated caller', status == 401)
        status, _ = call('/functions/v1/generate-content', body=brief, token=tokens[0], origin='https://untrusted.example')
        check('AI denies unapproved origin', status == 403)
        status, _ = call('/functions/v1/generate-content', body={**brief, 'idea': 'short'}, token=tokens[0], origin='http://localhost:5173')
        check('AI denies invalid brief', status == 400)
        status, _ = call('/functions/v1/generate-content', body={**brief, 'media': {'path': 'other-owner/photo.png', 'type': 'image/png'}},
                         token=tokens[0], origin='http://localhost:5173')
        check('AI denies foreign-owner attachment', status == 400)
        status, _ = call('/functions/v1/generate-content', body={**brief, 'idea': 'x' * 9000}, token=tokens[0], origin='http://localhost:5173')
        check('AI denies oversize streamed body', status == 413)
        with concurrent.futures.ThreadPoolExecutor(max_workers=21) as pool:
            answers = list(pool.map(lambda _: call('/rest/v1/rpc/consume_ai_quota', body={}, token=tokens[0]), range(21)))
        check('21 simultaneous quota calls allow exactly 20', all(status == 200 for status, _ in answers)
              and sum(value is True for _, value in answers) == 20 and sum(value is False for _, value in answers) == 1)
        status, data = call('/functions/v1/generate-content', body=brief, token=tokens[0], origin='http://localhost:5173')
        check('AI denies exhausted quota without generation', status == 429 and isinstance(data, dict) and isinstance(data.get('error'), str))
        status, data = call('/rest/v1/ai_usage?user_id=eq.' + user['id'], 'GET', token=tokens[0])
        check('fixture quota counter stops at 20', status == 200 and isinstance(data, list) and len(data) == 1 and data[0].get('calls') == 20)
        status, _ = call('/auth/v1/logout?scope=global', token=tokens[0])
        check('actual global fixture logout succeeds', status == 204)
        for index, token in enumerate(tokens):
            status, data = call('/rest/v1/rpc/has_active_session', body={}, token=token)
            check('ended session cannot regain database access ' + str(index + 1), status == 401 or (status == 200 and data is False))
            status, _ = call('/functions/v1/generate-content', body=brief, token=token, origin='http://localhost:5173')
            check('old token cannot use AI after global logout ' + str(index + 1), status == 401)
    except Exception as error:
        report['failure'] = str(error) if isinstance(error, AssertionError) else type(error).__name__
        print(json.dumps({'failure': report['failure']}), flush=True)
    finally:
        report['passed'] = bool(report['checks']) and 'failure' not in report and all(item['passed'] for item in report['checks'])
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps({'passed': report['passed'], 'checks': len(report['checks']), 'cleanup_verified': False}), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
