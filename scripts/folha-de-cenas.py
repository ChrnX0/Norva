#!/usr/bin/env python3
"""
A folha de contato das cenas de cabeçalho.

**Por que existe.** Uma foto por tela responde *"essa cena está boa?"*. Só a folha
inteira responde *"elas parecem a mesma mão?"* — que é a pergunta que importa
quando são quinze desenhos feitos em sequência, e é uma pergunta que nenhuma
checagem automática faz.

Na primeira vez que rodou, com sete cenas, ela denunciou três defeitos que sete
fotos separadas não tinham denunciado: o catálogo com sete cópias do mesmo picolé
(o padrão de papel de parede que o dono já tinha recusado na rua), os dois balões
do assistente do mesmo tamanho dizendo a mesma coisa, e um segmento de chão solto
no meio do espelho que lia como a linha do chão quebrada.

**Uso.** Rode `npm run shot` antes, para as fotos existirem:

    npm run shot -- --com-dado --rota /places,/catalog,/orders
    python3 scripts/folha-de-cenas.py                  # todas as que houver
    python3 scripts/folha-de-cenas.py places catalog   # só estas

Sai em `.shots/folha-de-cenas.png`.

**A faixa é fixa e é a do cabeçalho** (y de 150 a 300 na foto de 824 de largura):
recortar cada tela no mesmo lugar é o que permite comparar. Se o cabeçalho mudar
de altura, este número muda junto — e é melhor ele estar errado e visível aqui do
que a folha sair desalinhada sem ninguém saber por quê.
"""
import os
import subprocess
import sys
import time

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit('falta a Pillow: pip install --break-system-packages Pillow')

FAIXA = (0, 150, 824, 300)
SUFIXO = '-papel-claro-com-dado.png'

alvos = sys.argv[1:]
arquivos = sorted(
    f for f in os.listdir('.shots')
    if f.endswith(SUFIXO) and (not alvos or any(f.startswith(a) for a in alvos))
)
if not arquivos:
    sys.exit('nenhuma foto casou — rode `npm run shot` antes')

# Monta a folha ENQUANTO a exportação escreve e você lê uma linha velha sem
# saber. Aconteceu na primeira vez: julguei uma cena pela versão anterior dela e
# quase "consertei" um desenho que já estava certo. Duas redes contra isso — a
# recusa se o `shot.mjs` estiver de pé, e a hora de cada arquivo escrita ao lado
# do nome, para uma linha atrasada aparecer em vez de enganar.
try:
    vivo = subprocess.run(['pgrep', '-f', 'scripts/shot' + '.mjs'],
                          capture_output=True, text=True).stdout.strip()
except FileNotFoundError:
    vivo = ''
if vivo:
    sys.exit('a exportação ainda está rodando — a folha sairia com linhas velhas. Espere terminar.')

tiras = [
    (f'{f[: -len(SUFIXO)]}  ·  {time.strftime("%H:%M", time.localtime(os.path.getmtime(f".shots/{f}")))}',
     Image.open(f'.shots/{f}').crop(FAIXA))
    for f in arquivos
]
altura = FAIXA[3] - FAIXA[1]
folha = Image.new('RGB', (FAIXA[2], altura * len(tiras)), '#FAF7F2')
lapis = ImageDraw.Draw(folha)
for i, (nome, tira) in enumerate(tiras):
    folha.paste(tira, (0, i * altura))
    lapis.text((14, i * altura + 8), nome, fill='#A08C74')
folha.save('.shots/folha-de-cenas.png')

print(f"{len(tiras)} cenas: {', '.join(n for n, _ in tiras)}")
print('.shots/folha-de-cenas.png')
