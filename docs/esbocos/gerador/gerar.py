# -*- coding: utf-8 -*-
"""Os doze esboços: três famílias, quatro variações cada, duas claras e duas escuras."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from pecas import PALETAS, TABBAR, TABCSS, cena_fabrica, cena_colina

SAIDA = Path('/tmp/claude-0/-home-user-SZG-app/3cd30dd5-15bc-5fda-b553-6d2524a27ce3/scratchpad/esbocos')

SEMANA = [38, 44, 41, 6, 82, 46, 64]
DIAS = ['qui', 'sex', 'sáb', 'dom', 'seg', 'ter', 'qua']

def barras(p, redondo=False):
    r = '10px 10px 4px 4px' if redondo else '2px'
    linhas = ''.join(
        f'<i class="{"on" if i == 6 else ""}" style="height:{h}%"></i>' for i, h in enumerate(SEMANA))
    dias = ''.join(f'<span>{d}</span>' for d in DIAS)
    css = f""".bars{{display:flex;gap:8px;align-items:flex-end;height:56px;margin:14px 0 5px}}
.bars i{{flex:1;background:{p['line']};border-radius:{r}}}
.bars i.on{{background:{p['accent']}}}
.days{{display:flex;gap:8px;font-size:10.5px;color:{p['faint']}}}.days span{{flex:1;text-align:center}}"""
    return f'<div class="bars">{linhas}</div><div class="days sf">{dias}</div>', css

def onda_semana(p):
    """A semana como linha ondulada com pontos, para as variantes de blob."""
    pts = [(24 + i * 60, 92 - h * 0.7) for i, h in enumerate(SEMANA)]
    d = f'M{pts[0][0]} {pts[0][1]:.0f}'
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        d += f' C{(x0 + x1) / 2:.0f} {y0:.0f} {(x0 + x1) / 2:.0f} {y1:.0f} {x1} {y1:.0f}'
    bolas = ''.join(
        f'<circle cx="{x}" cy="{y:.0f}" r="{7 if i == 6 else 4}" fill="{p["accent"] if i == 6 else p["line"]}"/>'
        for i, (x, y) in enumerate(pts))
    rot = ''.join(f'<text x="{x}" y="108" font-size="10" fill="{p["faint"]}" text-anchor="middle">{d2}</text>'
                  for (x, _), d2 in zip(pts, DIAS))
    return (f'<svg viewBox="0 0 388 116" style="width:100%;height:auto">'
            f'<path d="{d}" fill="none" stroke="{p["line"]}" stroke-width="3" stroke-linecap="round"/>'
            f'{bolas}{rot}</svg>')

def clima_cartao(p, estilo='cartao'):
    borda = f"border:1px solid {p['line']};border-radius:{'4px' if estilo == 'cartao' else '22px'}"
    return f"""<div class="weather">
  <svg width="72" height="72" viewBox="0 0 78 78" style="flex:0 0 72px">
    <circle cx="39" cy="39" r="15" fill="{p['accent']}22" stroke="{p['accent']}" stroke-width="1.5"/>
    <g stroke="{p['accent']}" stroke-width="1.5" stroke-linecap="round" fill="none">
      <path d="M39 8v10M39 60v10M8 39h10M60 39h10M17 17l7 7M54 54l7 7M61 17l-7 7M24 54l-7 7"/></g></svg>
  <div style="flex:1;min-width:0">
    <div class="kicker sf">são paulo &middot; agora</div>
    <div class="wt">21° <span class="wmin sf">mín 13°</span></div>
    <div class="gauge"><span style="width:47%"></span></div>
    <div class="wline sf"><span>47% de chance de chuva</span><span class="r">amanhã +4°</span></div>
  </div></div>""", f""".weather{{margin-top:16px;padding:15px 18px;{borda};background:{p['surface']};
 display:flex;gap:16px;align-items:center}}
.wt{{font-size:42px;letter-spacing:-.03em;line-height:1.05;color:{p['ink']}}}
.wmin{{font-size:14px;color:{p['muted']};letter-spacing:0}}
.gauge{{height:3px;background:{p['line']};margin:9px 0 7px;border-radius:2px}}
.gauge span{{display:block;height:3px;background:{p['cool']};border-radius:2px}}
.wline{{font-size:12px;color:{p['muted']};display:flex;justify-content:space-between;gap:8px}}
.wline .r{{color:{p['accent']}}}"""

def lista(p):
    return f"""<div class="rule"></div>
<div class="row"><span class="ico"><svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="{p['accent']}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M13 23c-7-4.5-9-11-4.5-13.5 2-1.2 3.5-.4 4.5.7 1-1.1 2.5-1.9 4.5-.7C22 12 20 18.5 13 23z"/><path d="M13 10.2L8.6 7M13 10.2L17.4 7M13 10.2V5.5"/></svg></span>
  <div class="rt"><div class="t">Polpa de morango</div><div class="s sf">acaba em um dia, pelo consumo da semana</div></div>
  <div class="v">1 <small>dia</small></div></div>
<div class="row"><span class="ico"><svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="{p['c3']}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 7.5h12v10H3z"/><path d="M15 11h4l3.5 3.5v3H15z"/><circle cx="7.5" cy="19.5" r="2"/><circle cx="18" cy="19.5" r="2"/></svg></span>
  <div class="rt"><div class="t">Saiu para as lojas</div><div class="s sf">uma caixa, hoje de manhã</div></div>
  <div class="v">1 <small>caixa</small></div></div>
<div class="row"><span class="ico"><svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="{p['c4']}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 14V5a1.5 1.5 0 0 1 1.5-1.5H13L23 13.5 13.5 23z"/><circle cx="8" cy="8" r="1.8"/></svg></span>
  <div class="rt"><div class="t">Preços que mexeram</div>
    <div class="chips"><em class="dn">▼ 0,6% polpa</em><em class="dn">▼ 2,2% açúcar</em><em class="up">▲ 0,9% glucose</em></div></div></div>"""

LISTA_CSS = """.rule{{height:1px;background:{line};margin:16px 0 2px}}
.row{{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid {line}}}
.ico{{flex:0 0 30px;height:30px;display:flex;align-items:center;justify-content:center}}
.rt{{flex:1;min-width:0}}
.t{{font-size:17px;line-height:1.2;color:{ink}}}
.s{{font-size:12.5px;color:{muted};margin-top:4px}}
.v{{font-size:19px;white-space:nowrap;color:{ink}}}
.v small{{font-size:12px;color:{muted};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}}
.chips{{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}}
.chips em{{font-style:normal;font-size:11px;border:1px solid {line};border-radius:20px;padding:3px 8px;color:{muted};background:{surface}}}
.chips em.dn{{color:{ok}}} .chips em.up{{color:{warn}}}"""

BASE_CSS = """*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:412px;min-height:915px;overflow-x:hidden;background:{bg};color:{ink};
 -webkit-font-smoothing:antialiased;font-family:{fonte}}}
.sf{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}}
.wrap{{padding:24px 24px 112px}}
.kicker{{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:{faint}}}
h1{{font-size:31px;line-height:1.08;margin-top:9px;font-weight:400;letter-spacing:-.01em;color:{ink}}}
h1 b{{font-weight:700}}
.cap{{font-size:11px;font-style:italic;color:{faint};margin-top:4px}}
.note{{font-size:14.5px;color:{muted};line-height:1.55;margin-top:12px}}
.note b{{color:{ink};font-weight:700}}
.scene svg{{display:block;width:100%;height:auto}}"""

SERIF = 'Georgia,"Times New Roman",serif'
SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'


def pagina(arquivo, titulo, paleta, fonte, corpo, css_extra=''):
    p = PALETAS[paleta]
    barras_html, barras_css = barras(p, redondo=(fonte == SANS))
    clima_html, clima_css = clima_cartao(p, 'cartao' if fonte == SERIF else 'macio')
    html = corpo.replace('{{BARRAS}}', barras_html).replace('{{CLIMA}}', clima_html)
    html = html.replace('{{LISTA}}', lista(p))
    css = '\n'.join([
        BASE_CSS.format(fonte=fonte, **p),
        barras_css, clima_css, LISTA_CSS.format(**p),
        TABCSS.format(**p), css_extra.format(**p),
    ])
    (SAIDA / arquivo).write_text(
        f'<!doctype html><meta charset="utf-8"><title>NORVA — {titulo}</title>\n'
        f'<style>\n{css}\n</style>\n{html}\n{TABBAR.format(**p)}\n',
        encoding='utf-8')
    print('escrito', arquivo)


CABECA = '<div class="kicker sf">NORVA &middot; quarta, 2 de setembro</div>\n  <h1>Hoje a fábrica<br><b>fez 500 unidades</b></h1>'
RESUMO = ('<div class="note">Ontem foram <b>478</b> — hoje saíram <b>22 a mais</b>. '
          'Contra a quarta passada, <b>19 acima</b>. O ritmo da semana está firme.</div>')


# ---------------------------------------------------------------- 1. PAPEL
def papel(arquivo, titulo, paleta, escala):
    p = PALETAS[paleta]
    if escala == 'grande':
        cena = f'<div class="scene big">{cena_fabrica(p, 150, "cheio")}<div class="cap">A linha inteira — do tacho à caixa que saiu.</div></div>'
        corpo = f'<div class="wrap">\n  {CABECA}\n  {cena}\n  {{{{BARRAS}}}}\n  {RESUMO}\n  {{{{CLIMA}}}}\n  {{{{LISTA}}}}\n</div>'
        extra = '.scene.big{{margin:14px -6px 2px}}'
    else:  # vinheta: desenho pequeno, mais texto
        cena = f'<div class="scene mini">{cena_fabrica(p, 150, "curto")}</div>'
        corpo = (f'<div class="wrap">\n  <div class="vin">{cena}<div>{CABECA}</div></div>\n'
                 f'  {RESUMO}\n  {{{{BARRAS}}}}\n  {{{{CLIMA}}}}\n  {{{{LISTA}}}}\n</div>')
        extra = ('.vin{{display:flex;gap:14px;align-items:flex-start}}'
                 '.scene.mini{{flex:0 0 120px;opacity:.9}}'
                 '.vin h1{{font-size:26px}}')
    pagina(arquivo, titulo, paleta, SERIF, corpo, extra)


papel('29-papel-claro-a.html', 'papel claro, cena grande', 'papel-claro', 'grande')
papel('30-papel-claro-b.html', 'papel claro, vinheta', 'papel-claro', 'vinheta')
papel('31-papel-escuro-a.html', 'papel escuro, cena grande', 'papel-escuro', 'grande')
papel('32-papel-escuro-b.html', 'papel escuro, vinheta', 'papel-escuro', 'vinheta')


# ---------------------------------------------------------------- 2. ORGÂNICO
def organico(arquivo, titulo, paleta, momento, forma):
    p = PALETAS[paleta]
    topo = f'''<div class="topo">{cena_colina(p, momento)}
    <div class="sobre">
      <div class="marca sf">NORVA</div>
      <div class="dia sf">quarta-feira, 2 de setembro</div>
      <div class="n">500</div>
      <div class="sub sf">unidades produzidas hoje</div>
      <div class="pills sf"><em>ontem <b>478</b></em><em>↑ <b>+19</b> que na quarta passada</em></div>
    </div></div>'''
    semana = (f'<div class="card"><div class="ct">A semana</div>{onda_semana(p)}</div>'
              if forma == 'blob' else
              f'<div class="card"><div class="ct">A semana</div>{{{{BARRAS}}}}</div>')
    corpo = (f'{topo}\n<div class="wrap">\n  {semana}\n  <div class="card">{{{{CLIMA}}}}</div>\n'
             f'  <div class="card">{{{{LISTA}}}}</div>\n</div>')
    raio = '38px 38px 30px 30px' if forma == 'blob' else '24px'
    extra = f'''.topo{{{{position:relative}}}}
.topo svg{{{{display:block;width:100%;height:210px}}}}
.sobre{{{{position:absolute;left:24px;top:26px;color:{{ink}}}}}}
.marca{{{{font-size:13px;letter-spacing:.22em;font-weight:700}}}}
.dia{{{{font-size:13px;color:{{muted}};margin-top:2px}}}}
.n{{{{font-size:64px;line-height:1;letter-spacing:-.04em;font-weight:600;margin-top:4px}}}}
.sub{{{{font-size:14px;color:{{muted}}}}}}
.pills{{{{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}}}}
.pills em{{{{font-style:normal;font-size:12px;background:{{surface}}cc;border-radius:20px;padding:5px 11px;color:{{muted}}}}}}
.pills b{{{{color:{{ink}}}}}}
.wrap{{{{padding:14px 20px 112px;margin-top:-26px;position:relative}}}}
.card{{{{background:{{surface}};border-radius:{raio};padding:18px;margin-bottom:14px;box-shadow:0 8px 28px #0000000f}}}}
.ct{{{{font-size:17px;font-weight:600;color:{{ink}};margin-bottom:6px}}}}
.rule{{{{display:none}}}}
.row:last-child{{{{border-bottom:0}}}}
.weather{{{{margin-top:0;border:0;padding:0;background:transparent}}}}'''
    pagina(arquivo, titulo, paleta, SANS, corpo, extra)


organico('33-organico-claro-a.html', 'orgânico dia, cena grande', 'org-claro', 'dia', 'cartao')
organico('34-organico-claro-b.html', 'orgânico dia, formas', 'org-claro', 'dia', 'blob')
organico('35-organico-escuro-a.html', 'orgânico entardecer', 'org-entardecer', 'entardecer', 'cartao')
organico('36-organico-escuro-b.html', 'orgânico musgo', 'noite', 'noite', 'blob')


# ---------------------------------------------------------------- 3. NOITE
def noite(arquivo, titulo, paleta, momento, forma):
    organico(arquivo, titulo, paleta, momento, forma)


noite('37-noite-escuro-a.html', 'noite ilustrada', 'noite', 'noite', 'cartao')
noite('38-noite-escuro-b.html', 'noite mínima', 'noite', 'noite', 'blob')
noite('39-noite-claro-a.html', 'amanhecer', 'amanhecer', 'amanhecer', 'cartao')
noite('40-noite-claro-b.html', 'dia limpo', 'org-claro', 'amanhecer', 'blob')
