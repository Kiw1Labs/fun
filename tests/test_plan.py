import subprocess
import sys


def test_nginx_plan_preserves_old_config(tmp_path):
    original = '# example }\nevents {}\nhttp {\n map $host $x { default "}"; }\n server { listen 8081; }\n}\n'
    active = tmp_path / 'active.conf'
    active.write_text(original)
    output = tmp_path / 'plan'
    subprocess.run([sys.executable, 'deploy/plan_nginx.py', str(active), str(output)], check=True)
    assert (output / 'nginx-before.conf').read_text() == original
    candidate = (output / 'nginx-candidate.conf').read_text()
    assert candidate.replace('    # Fun: adição isolada por hostname e porta\n    include /root/fun/current/deploy/nginx-fun.conf;\n', '') == original
    assert active.read_text() == original
