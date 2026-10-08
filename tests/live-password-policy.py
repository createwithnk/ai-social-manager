"""Verify hosted password length using intentionally invalid signup requests.

The initial five-character password is below Supabase's documented minimum.
An optional boundary probe runs only after the server reports the expected
minimum. Every address is unique and reserved under example.invalid. A valid
signup, email-delivery test, model request or payment is never requested.
Independently verify that no fixture user was created after every run.
"""
import argparse
import datetime
import json
import re
import secrets
import urllib.error
import urllib.request
import uuid
from pathlib import Path


class RejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', required=True)
    parser.add_argument('--expect', type=int)
    parser.add_argument('--boundary', action='store_true')
    args = parser.parse_args()
    if args.boundary and (args.expect is None or args.expect < 12):
        parser.error('Boundary verification requires an expected minimum >=12.')
    config = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    root = config['VITE_SUPABASE_URL'].strip().strip('"').strip("'")
    key = config['VITE_SUPABASE_ANON_KEY'].strip().strip('"').strip("'")
    assert root == 'https://nkfecpdegcmsapvbviky.supabase.co'
    run = str(uuid.uuid4())
    opener = urllib.request.build_opener(RejectRedirect())
    report = {'verified_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'project_ref': 'nkfecpdegcmsapvbviky', 'fixture_run': run,
              'expected_minimum': args.expect, 'checks': [],
              'fixture_emails': [], 'unexpected_signup_user_ids': [],
              'valid_signup_or_email_delivery_test_requested': False,
              'cleanup_verified': False}

    def probe(length):
        email = 'aasiflow-policy-' + run + '-' + str(length) + '@example.invalid'
        report['fixture_emails'].append(email)
        alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_!'
        password = 'Aa7!' + ''.join(secrets.choice(alphabet) for _ in range(length - 4))
        body = {'email': email, 'password': password,
                'data': {'aasiflow_password_policy_probe': run}}
        req = urllib.request.Request(root + '/auth/v1/signup', data=json.dumps(body).encode(),
                                     headers={'apikey': key, 'Content-Type': 'application/json'},
                                     method='POST')
        try:
            with opener.open(req, timeout=20) as response:
                status, raw = response.status, response.read(65536)
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read(65536)
        result = json.loads(raw)
        if status < 400:
            user = result.get('user', result)
            if isinstance(user, dict) and user.get('id'):
                report['unexpected_signup_user_ids'].append(user['id'])
        message = result.get('msg', result.get('message', ''))
        match = re.search(r'at least\s+(\d+)\s+characters', message, re.I)
        minimum = int(match.group(1)) if match else None
        passed = status == 422 and result.get('error_code') == 'weak_password'
        passed = passed and minimum is not None and 6 <= minimum <= 128
        passed = passed and (args.expect is None or minimum == args.expect)
        check = {'name': 'rejects password of ' + str(length) + ' characters',
                 'password_length': length, 'status': status,
                 'error_code': result.get('error_code'),
                 'minimum_password_length': minimum, 'passed': bool(passed)}
        report['checks'].append(check)
        print(json.dumps(check), flush=True)
        if not passed:
            raise AssertionError(check['name'])
        return minimum

    try:
        minimum = probe(5)
        if args.boundary:
            probe(minimum - 1)
        report['observed_minimum_password_length'] = minimum
    except Exception as error:
        report['failure'] = str(error) if isinstance(error, AssertionError) else type(error).__name__
    report['passed'] = bool(report['checks']) and 'failure' not in report
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
