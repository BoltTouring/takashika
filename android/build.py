#!/usr/bin/env python3
"""Build a signed APK with the official SDK tools; no Gradle or Google services needed."""
from pathlib import Path
import os, shutil, subprocess, zipfile

root = Path(__file__).resolve().parent
repo = root.parent
sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'Library/Android/sdk')))
tools = sdk / 'build-tools' / '36.0.0'
platform = sdk / 'platforms/android-36/android.jar'
java = Path(os.environ.get('JAVA_HOME', '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home'))
signing = Path(os.environ.get('TAKASHIKA_SIGNING_DIR', str(repo / '.signing')))
if not (signing / 'release.jks').exists() or not (signing / 'password').exists():
    raise SystemExit('Missing release signing key. See android/README.md.')
build = root / 'build'
if build.exists(): shutil.rmtree(build)
for directory in ('classes', 'dex', 'assets'):
    (build / directory).mkdir(parents=True)
for name in ('index.html', 'styles.css', 'app.js', 'manifest.json', 'js', 'icons'):
    source, target = repo / name, build / 'assets' / name
    if source.is_dir(): shutil.copytree(source, target)
    else: shutil.copy2(source, target)
env = dict(os.environ, JAVA_HOME=str(java))
def run(*args): subprocess.run([str(a) for a in args], check=True, env=env)
run(tools / 'aapt2', 'compile', '--dir', root / 'res', '-o', build / 'resources.zip')
run(tools / 'aapt2', 'link', '-o', build / 'unsigned.apk', '--manifest', root / 'AndroidManifest.xml', '-I', platform, '-A', build / 'assets', build / 'resources.zip')
run(java / 'bin/javac', '--release', '8', '-classpath', platform, '-d', build / 'classes', *root.glob('src/**/*.java'))
run(java / 'bin/jar', 'cf', build / 'classes.jar', '-C', build / 'classes', '.')
run(tools / 'd8', '--release', '--min-api', '28', '--lib', platform, '--output', build / 'dex', build / 'classes.jar')
with zipfile.ZipFile(build / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as apk:
    for dex in (build / 'dex').glob('*.dex'): apk.write(dex, dex.name)
run(tools / 'zipalign', '-P', '16', '-f', '4', build / 'unsigned.apk', build / 'aligned.apk')
output = repo / 'release/Takashika-1.0.0-android.apk'
output.parent.mkdir(exist_ok=True)
run(tools / 'apksigner', 'sign', '--ks', signing / 'release.jks', '--ks-key-alias', 'takashika', '--ks-pass', 'file:' + str(signing / 'password'), '--out', output, build / 'aligned.apk')
run(tools / 'apksigner', 'verify', '--verbose', output)
run(tools / 'zipalign', '-c', '-P', '16', '4', output)
print(output)
