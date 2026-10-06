"""Live checks using disposable confirmed users; provider calls require --allow-ai.

Credentials JSON: {"run": "uuid", "users": [{"id": "uuid", "email": "...",
"password": "..."}, ...]}. Use exactly two isolated test users.
An optional sessions JSON from a prior verified login avoids logging in again.
The caller must remove the two Auth fixtures after this script finishes.
The tiny private media fixture is retained for an authorized administrator to remove.
"""
import argparse
import concurrent.futures
import json
import struct
import urllib.error
import urllib.request
import zlib
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--sessions')
    parser.add_argument('--report', required=True)
    parser.add_argument('--allow-ai', action='store_true')
    args = parser.parse_args()
    config = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    root = config['VITE_SUPABASE_URL'].strip().strip('\"').strip("'")
    public_key = config['VITE_SUPABASE_ANON_KEY'].strip().strip('\"').strip("'")
    fixtures = json.loads(Path(args.credentials).read_text())
    users = fixtures['users']
    assert len(users) == 2 and all(u['email'].endswith('@example.invalid') for u in users)
    report = {'checks': [], 'ai': {}, 'ai_requested': args.allow_ai, 'cleanup': {}, 'run': fixtures['run']}
    tokens = []
    post_id = None
    media_path = f"{users[0]['id']}/{fixtures['run']}-test.png"
    report['test_media_path'] = media_path
    uploaded = False

    def check(name, valid):
        report['checks'].append({'name': name, 'passed': bool(valid)})
        print(json.dumps({'check': name, 'passed': bool(valid)}), flush=True)
        if not valid:
            raise AssertionError(name)

    def request(path, method='GET', body=None, token=None, origin=None,
                raw=False, timeout=30, signed=False):
        headers = {} if signed else {'apikey': public_key}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        if origin:
            headers['Origin'] = origin
        if body is not None:
            headers['Content-Type'] = 'image/png' if isinstance(body, bytes) else 'application/json'
            body = body if isinstance(body, bytes) else json.dumps(body).encode()
        if path.startswith('/rest/v1/') and method in ('POST', 'PATCH', 'DELETE'):
            headers['Prefer'] = 'return=representation'
        url = root + path
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                data, status = response.read(), response.status
        except urllib.error.HTTPError as error:
            data, status = error.read(), error.code
        if raw:
            return status, data
        try:
            return status, json.loads(data) if data else None
        except json.JSONDecodeError:
            return status, None

    brief = {'idea': 'A fictional cafe serves freshly brewed coffee. Invite readers to visit without inventing prices, offers or dates.',
             'platform': 'X', 'tone': 'Friendly', 'language': 'Hindi'}
    try:
        if args.sessions:
            saved = json.loads(Path(args.sessions).read_text())
            assert saved['run'] == fixtures['run']
            tokens = [s['access_token'] for s in saved['sessions']]
        else:
            for user in users:
                status, data = request('/auth/v1/token?grant_type=password', 'POST',
                                       {'email': user['email'], 'password': user['password']})
                check('confirmed test account login', status == 200 and data['user']['id'] == user['id'])
                tokens.append(data['access_token'])
        for user, token in zip(users, tokens):
            status, data = request('/auth/v1/user', token=token)
            check('authenticated user identity', status == 200 and data['id'] == user['id'])
        status, _ = request('/functions/v1/generate-content', 'POST', brief)
        check('AI rejects unauthenticated caller', status == 401)
        try:
            status, _ = request('/functions/v1/generate-content', 'POST', brief, tokens[0], 'https://untrusted.example')
            check('AI rejects other origins', status == 403)
        except (urllib.error.URLError, TimeoutError):
            report['checks'].append({'name': 'AI rejects other origins', 'passed': None, 'error': 'Network response unavailable'})
            print(json.dumps({'check': 'AI rejects other origins', 'passed': None, 'error': 'Network response unavailable'}), flush=True)
        status, _ = request('/functions/v1/generate-content', 'POST', {**brief, 'idea': 'short'}, tokens[0], 'http://localhost:5173')
        check('AI rejects invalid brief', status == 400)
        status, _ = request('/functions/v1/generate-content', 'POST',
                            {**brief, 'media': {'path': f"{users[1]['id']}/other.png", 'type': 'image/png'}},
                            tokens[0], 'http://localhost:5173')
        check('AI rejects another user attachment', status == 400)

        if args.allow_ai:
            status, data = request('/functions/v1/generate-content', 'POST', brief, tokens[0], 'http://localhost:5173', timeout=75)
            report['ai']['text_status'] = status
            if status == 200:
                text = data['caption'] + '\n\n' + ' '.join('#' + tag for tag in data['hashtags'])
                check('live AI JSON and Hindi caption', isinstance(data['caption'], str) and isinstance(data['hashtags'], list)
                      and any('\u0900' <= ch <= '\u097f' for ch in data['caption']))
                check('live AI X length', len(text.encode('utf-16-le')) // 2 <= 280)
                report['ai']['text_caption'] = data['caption']
                report['ai']['hashtags'] = data['hashtags']
            else:
                report['ai']['error'] = data.get('error', 'No usable provider response') if isinstance(data, dict) else 'No usable provider response'
            print(json.dumps({'ai_text_status': status, 'error': report['ai'].get('error')}), flush=True)

        def chunk(kind, data):
            return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\0\xbb\x7e\x40')) + chunk(b'IEND', b'')
        uploaded = True  # Report the fixture even if the upload response is interrupted.
        status, _ = request('/storage/v1/object/post-media/' + media_path, 'POST', png, tokens[0])
        check('private PNG upload', status in (200, 201))
        status, data = request('/storage/v1/object/post-media/' + media_path, token=tokens[0], raw=True)
        check('private PNG download', status == 200 and data == png)
        status, _ = request('/storage/v1/object/post-media/' + media_path, token=tokens[1], raw=True)
        check('other user cannot download', status != 200)
        status, data = request('/storage/v1/object/sign/post-media/' + media_path, 'POST', {'expiresIn': 60}, tokens[0])
        check('signed preview creation', status == 200 and isinstance(data.get('signedURL'), str))
        status, data = request('/storage/v1' + data['signedURL'], raw=True, signed=True)
        check('signed preview opens without session', status == 200 and data == png)
        status, _ = request('/storage/v1/object/sign/post-media/' + media_path, 'POST', {'expiresIn': 60}, tokens[1])
        check('other user cannot create preview', status != 200)

        media = {'path': media_path, 'name': 'test.png', 'type': 'image/png', 'size': len(png)}
        post = {**brief, 'user_id': users[0]['id'], 'caption': 'Temporary test draft', 'hashtags': ['Test'], 'status': 'draft', 'media': media}
        status, data = request('/rest/v1/posts', 'POST', post, tokens[0])
        check('post and attachment saved', status == 201 and len(data) == 1)
        post_id = data[0]['id']
        post_path = f'/rest/v1/posts?id=eq.{post_id}'
        status, data = request(post_path, token=tokens[0])
        check('saved post reload', status == 200 and len(data) == 1 and data[0]['media']['path'] == media_path)
        status, data = request(post_path, token=tokens[1])
        check('other user cannot read post', status == 200 and data == [])
        status, _ = request(post_path, 'PATCH', {'caption': 'Unauthorized change'}, tokens[1])
        status, data = request(post_path, token=tokens[0])
        check('other user cannot edit post', status == 200 and data[0]['caption'] == post['caption'])
        if args.allow_ai and report['ai'].get('text_status') == 200:
            status, data = request('/functions/v1/generate-content', 'POST', {**brief, 'media': media}, tokens[0], 'http://localhost:5173', timeout=75)
            report['ai']['media_status'] = status
            if status != 200:
                report['ai']['media_error'] = data.get('error', 'No usable provider response') if isinstance(data, dict) else 'No usable provider response'
            print(json.dumps({'ai_media_status': status}), flush=True)

        with concurrent.futures.ThreadPoolExecutor(max_workers=21) as executor:
            answers = list(executor.map(lambda _: request('/rest/v1/rpc/consume_ai_quota', 'POST', {}, tokens[1], timeout=60), range(21)))
        check('21 concurrent quota requests allow exactly 20', all(s == 200 for s, _ in answers)
              and sum(value is True for _, value in answers) == 20 and sum(value is False for _, value in answers) == 1)
        status, data = request('/functions/v1/generate-content', 'POST', brief, tokens[1], 'http://localhost:5173')
        check('exhausted app quota rejects AI', status == 429 and data['error'].startswith('Daily limit'))
        status, data = request(f"/rest/v1/ai_usage?user_id=eq.{users[1]['id']}", token=tokens[1])
        check('quota counter stops at 20', status == 200 and len(data) == 1 and data[0]['calls'] == 20)
        status, data = request(f"/rest/v1/ai_usage?user_id=eq.{users[1]['id']}", token=tokens[0])
        check('other user cannot read quota', status == 200 and data == [])
    except Exception as error:
        report['failure'] = type(error).__name__ + ': ' + str(error)[:200]
        print(json.dumps({'failure': report['failure']}), flush=True)
    finally:
        if post_id and tokens:
            try:
                status, _ = request(f'/rest/v1/posts?id=eq.{post_id}', 'DELETE', token=tokens[0])
                report['cleanup']['post_deleted'] = status in (200, 204)
            except Exception:
                report['cleanup']['post_deleted'] = False
        if uploaded:
            report['cleanup']['file_retained_privately'] = True
        report['core_passed'] = 'failure' not in report and all(item['passed'] is True for item in report['checks'])
        report['ai_passed'] = (report['ai'].get('text_status') == 200 and
                               report['ai'].get('media_status') == 200) if args.allow_ai else None
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps({'core_passed': report['core_passed'], 'ai': report['ai'], 'cleanup': report['cleanup']}, ensure_ascii=False), flush=True)
    return 0 if report['core_passed'] and report['ai_passed'] is not False else 1


if __name__ == '__main__':
    raise SystemExit(main())
