#!/usr/bin/env bash
# Deixa este container pronto para compilar E RODAR o app num emulador Android.
#
# Por que este arquivo existe: o container é descartável e já reiniciou no meio de uma
# sessão. Sem isto, cada reinício custa a mesma hora de descoberta de novo. Rodar duas
# vezes não faz mal — tudo aqui é idempotente.
#
# A parte que não é óbvia: esta máquina NÃO tem virtualização (`/dev/kvm` não existe e a
# CPU não expõe `vmx`/`svm`), então o emulador roda por software (`-accel off`). Isso só é
# viável com uma imagem ATD — Automated Test Device —, que é a imagem que o Google publica
# para CI headless: sem launcher, sem papel de parede, sem app de sistema. Com uma imagem
# comum o boot não termina; com a ATD, termina.
set -euo pipefail

export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

IMAGEM="${IMAGEM:-system-images;android-30;aosp_atd;x86_64}"
AVD="${AVD:-norva}"

dizer() { printf '\n\033[1m› %s\033[0m\n' "$*"; }

dizer "variáveis no shell interativo"
PERFIL=~/.bashrc
if ! grep -q 'ANDROID_HOME=/opt/android-sdk' "$PERFIL" 2>/dev/null; then
  cat >> "$PERFIL" <<'PERF'

# Android, posto aqui por scripts/ambiente.sh
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
PERF
fi

dizer "bibliotecas de sistema que o emulador procura"
# libpulse é a única que falta de verdade; as outras 23 que o `ldd` acusa estão
# empacotadas dentro de emulator/lib64 e só aparecem porque o ldd ignora o RPATH.
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq libpulse0 libnss3 libxcb-cursor0 libgl1 libx11-xcb1 libasound2t64

dizer "SDK: platform-tools e a imagem $IMAGEM"
yes | sdkmanager --licenses >/dev/null 2>&1 || true
sdkmanager --install "platform-tools" "$IMAGEM" >/dev/null

dizer "AVD $AVD"
# 1080x2340 a 440 dpi: densidade de aparelho de verdade. Metade dos defeitos de layout só
# aparece na densidade certa — foi o que a versão web escondeu e o que deixou um tema
# claro ilegível chegar ao dono.
if ! avdmanager list avd -c | grep -qx "$AVD"; then
  echo no | avdmanager create avd -n "$AVD" -k "$IMAGEM" --device "pixel_5" --force
fi
INI="$HOME/.android/avd/$AVD.avd/config.ini"
if [ -f "$INI" ]; then
  sed -i 's/^hw\.lcd\.density=.*/hw.lcd.density=440/'    "$INI" 2>/dev/null || true
  sed -i 's/^hw\.lcd\.width=.*/hw.lcd.width=1080/'       "$INI" 2>/dev/null || true
  sed -i 's/^hw\.lcd\.height=.*/hw.lcd.height=2340/'     "$INI" 2>/dev/null || true
  grep -q '^hw.keyboard=' "$INI" || echo 'hw.keyboard=yes' >> "$INI"
fi

dizer "afinação do Gradle"
# `android/` é gerado pelo `expo prebuild` e ignorado pelo git (.gitignore:41), então
# qualquer ajuste feito lá some no próximo prebuild. Por isso ele é reaplicado aqui em
# vez de commitado: este script é o lugar onde a afinação sobrevive.
GP=/home/user/SZG-app/android/gradle.properties
if [ -f "$GP" ]; then
  # `org.gradle.jvmargs` estava declarado duas vezes (-Xmx2048m e depois -Xmx3g). A
  # segunda vencia e a primeira era ruído que confundia quem lesse.
  sed -i '/^org\.gradle\.jvmargs=-Xmx2048m/d' "$GP"
  grep -q '^org.gradle.caching=' "$GP" || echo 'org.gradle.caching=true' >> "$GP"
  grep -q '^org.gradle.configureondemand=' "$GP" || echo 'org.gradle.configureondemand=true' >> "$GP"
  echo "  jvmargs sem duplicata, cache de tarefa ligado"
else
  echo "  (sem android/ ainda — rode 'npx expo prebuild' e chame este script de novo)"
fi

dizer "pronto"
echo "  emulador:  $(command -v emulator)"
echo "  adb:       $(command -v adb)"
echo "  imagem:    $IMAGEM"
echo "  avd:       $AVD"
echo
echo "  suba com:  node scripts/aparelho.mjs subir"
