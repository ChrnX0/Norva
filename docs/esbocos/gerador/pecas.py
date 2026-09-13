# -*- coding: utf-8 -*-
"""As peças compartilhadas pelos doze esboços: paletas, cenas e a barra de abas."""

TABBAR = """<div class="tabbar">
  <a class="on"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg><span>Início</span></a>
  <a style="color:{c2}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="14" rx="6"/><path d="M12 16.5v5"/></svg><span class="lbl">Produção</span></a>
  <a style="color:{c3}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7.5h11v9H2z"/><path d="M13 11h4l3.5 3.5v2H13z"/><circle cx="6.5" cy="18.5" r="1.9"/><circle cx="16.5" cy="18.5" r="1.9"/></svg><span class="lbl">Transporte</span></a>
  <a style="color:{c4}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 20h16"/><path d="M6.5 20v-6"/><path d="M12 20V5"/><path d="M17.5 20v-9"/></svg><span class="lbl">Relatórios</span></a>
  <a style="color:{c5}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg><span class="lbl">Mais</span></a>
</div>"""

TABCSS = """.tabbar{{position:fixed;bottom:0;left:0;right:0;height:78px;display:flex;align-items:center;
 justify-content:space-around;padding-bottom:14px;font-size:11px;background:{bg};border-top:1px solid {line};
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}}
.tabbar a{{display:flex;flex-direction:column;align-items:center;gap:5px;color:{faint};text-decoration:none}}
.tabbar a.on{{color:{accent}}}
.tabbar a.on span{{color:{accent};font-weight:600}}
.tabbar .lbl{{color:{faint}}}"""

# ---------------------------------------------------------------- paletas
PALETAS = {
    'papel-claro': dict(bg='#faf7f2', surface='#ffffff', ink='#221f1b', muted='#6f6558',
                        faint='#a2988a', line='#e2dbd0', accent='#b4552d', cool='#6f8188',
                        ok='#3d7a53', warn='#a8442a', c2='#a9714b', c3='#6f8188', c4='#b28e42', c5='#9a9083'),
    'papel-escuro': dict(bg='#15110d', surface='#1e1915', ink='#f4ece0', muted='#b6a894',
                         faint='#7e7161', line='#2f271f', accent='#e08a5a', cool='#8fa8b0',
                         ok='#6fbf8f', warn='#e8875f', c2='#e0a97f', c3='#8fa8b0', c4='#d9b76a', c5='#9a9083'),
    'org-claro': dict(bg='#f3f7f3', surface='#ffffff', ink='#16281d', muted='#4d6055',
                      faint='#8ba192', line='#dde9df', accent='#2f7d5c', cool='#5b8ec9',
                      ok='#2f7d5c', warn='#c2751f', c2='#e29b52', c3='#6b7fd0', c4='#b28e42', c5='#8ba192'),
    'org-entardecer': dict(bg='#1b1626', surface='#241d33', ink='#f7efe6', muted='#c0b2c8',
                           faint='#8a7d97', line='#332a45', accent='#f0955a', cool='#8aa8e0',
                           ok='#6fd6a0', warn='#f0955a', c2='#f0b07a', c3='#9fb6ec', c4='#e5c377', c5='#9a90a8'),
    'noite': dict(bg='#0c1512', surface='#13201b', ink='#eaf5ee', muted='#9db8a9',
                  faint='#6b8377', line='#1c2f27', accent='#5ef2a8', cool='#7fb6e8',
                  ok='#5ef2a8', warn='#f5a35e', c2='#7fd8a8', c3='#7fb6e8', c4='#e5c377', c5='#7f9a8c'),
    'amanhecer': dict(bg='#fdf5ef', surface='#ffffff', ink='#1d2a24', muted='#54655c',
                      faint='#9aa79f', line='#eadfd6', accent='#2f7d5c', cool='#d98b6a',
                      ok='#2f7d5c', warn='#c2751f', c2='#e08a5a', c3='#6b8fd0', c4='#c9a24a', c5='#9aa79f'),
}

# ---------------------------------------------------------------- cenas
def cena_fabrica(p, altura=150, detalhe='cheio'):
    """A linha de produção em traço: galpão, chaminé, câmara fria, picolés, morango, caixa."""
    tinta, quente, frio, fraco = p['ink'], p['accent'], p['cool'], p['faint']
    extra = ''
    if detalhe == 'cheio':
        extra = f'''
        <path d="M124 76h54v57h-54z"/><path d="M124 96h54M168 84v8M168 102v12"/>
        <g stroke="{frio}"><path d="M151 49v18M143 53.5l16 9M143 62.5l16-9"/></g>
        <rect x="192" y="82" width="20" height="34" rx="7"/><path d="M202 116v14"/>
        <rect x="216" y="82" width="20" height="34" rx="7" fill="{quente}" fill-opacity=".16" stroke="{quente}"/><path d="M226 116v14" stroke="{quente}"/>
        <rect x="240" y="82" width="20" height="34" rx="7"/><path d="M250 116v14"/>
        <g stroke="{quente}"><path d="M290 122c-14-9-18-22-9-27 4-2.5 7-1 9 1 2-2 5-3.5 9-1 9 5 5 18-9 27z"/>
          <path d="M290 96l-9-6M290 96l9-6M290 96v-9"/></g>
        <path d="M312 104h44v29h-44z"/><path d="M312 113h44M334 104v29"/><path d="M318 104l6-8h26l6 8"/>'''
    return f'''<svg viewBox="0 0 364 {altura}" role="img" aria-label="A fábrica">
      <g fill="none" stroke="{tinta}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M0 133h364" stroke="{fraco}"/>
        <path d="M28 34c-5 0-8-3-8-7s4-7 8-6c1-6 8-8 12-3 5-2 10 2 9 8" stroke="{fraco}"/>
        <circle cx="336" cy="30" r="11" stroke="{quente}"/>
        <g stroke="{quente}"><path d="M336 11v6M336 43v6M317 30h6M349 30h6M323 17l4 4M345 39l4 4M349 17l-4 4M327 39l-4 4"/></g>
        <path d="M20 88l0-16 16 16 0-16 16 16 0-16 16 16 0-16 16 16"/><path d="M20 88h64v45H20z"/>
        <path d="M28 98h9v9h-9zM42 98h9v9h-9zM56 98h9v9h-9zM28 113h9v9h-9z"/><path d="M56 133v-23h12v23"/>
        <path d="M92 133V58h14v75M90 62h18"/>
        <path d="M99 52c-7-5 5-11-2-17c-5-5 3-9 0-13" stroke="{fraco}"/>{extra}
      </g></svg>'''

def cena_colina(p, momento='dia'):
    """A paisagem: colinas, céu e o astro do momento."""
    if momento == 'dia':
        ceu_a, ceu_b = '#dff0e6', '#bfe3cf'
        colina_a, colina_b = '#a9dcc0', '#7cc9a6'
        astro = f'''<circle cx="316" cy="62" r="30" fill="#ffd76a"/>
          <g stroke="#ffd76a" stroke-width="5" stroke-linecap="round">
            <path d="M316 14v10M316 100v10M264 62h10M358 62h10M280 26l7 7M345 91l7 7M352 26l-7 7M287 91l-7 7"/></g>
          <path d="M232 104a24 24 0 0 1 24-23 31 31 0 0 1 58 9 20 20 0 0 1-4 40h-58a20 20 0 0 1-20-26z" fill="#ffffff"/>
          <g fill="#8ec5fc"><circle cx="258" cy="140" r="4"/><circle cx="288" cy="146" r="4"/><circle cx="318" cy="140" r="4"/></g>'''
    elif momento == 'entardecer':
        ceu_a, ceu_b = '#f7a26b', '#4b3a72'
        colina_a, colina_b = '#4b3a70', '#332856'
        astro = f'''<circle cx="316" cy="96" r="26" fill="#ffd08a"/>
          <ellipse cx="316" cy="128" rx="60" ry="8" fill="#ffb37a" opacity=".35"/>'''
    elif momento == 'amanhecer':
        ceu_a, ceu_b = '#ffe3d0', '#ffd0b0'
        colina_a, colina_b = '#c9e6cf', '#a4d6b6'
        astro = f'''<circle cx="316" cy="86" r="26" fill="#ffca7a"/>
          <ellipse cx="316" cy="120" rx="52" ry="7" fill="#ffd9a8" opacity=".45"/>
          <path d="M386 40a13 13 0 1 0 0-24 16 16 0 0 1 0 24z" fill="#ffffff" opacity=".8"/>'''
    else:  # noite
        ceu_a, ceu_b = '#132a23', '#0a1713'
        colina_a, colina_b = '#1e4536', '#15332a'
        astro = f'''<circle cx="320" cy="60" r="34" fill="#5ef2a8" opacity=".10"/>
          <path d="M330 40a24 24 0 1 0 0 42 28 28 0 0 1 0-42z" fill="#f7e6b5"/>
          <g fill="#eaf5ee" opacity=".8"><circle cx="60" cy="34" r="1.6"/><circle cx="132" cy="20" r="1.3"/><circle cx="196" cy="46" r="1.5"/><circle cx="252" cy="24" r="1.2"/><circle cx="98" cy="70" r="1.2"/></g>'''
    escuro = momento in ('noite', 'entardecer')
    corpo_fab = '#0e211b' if escuro else '#3f8f6a'
    janela = '#ffd98a' if escuro else '#ffffff'
    fabrica = f'''<g fill="{corpo_fab}"><path d="M282 156h60v30h-60z"/><path d="M282 156l10-15 10 15 10-15 10 15 10-15 10 15"/>
        <rect x="348" y="132" width="9" height="54"/></g>
        <g fill="{janela}"><rect x="290" y="166" width="8" height="8"/><rect x="304" y="166" width="8" height="8"/><rect x="318" y="166" width="8" height="8"/></g>'''
    return f'''<svg viewBox="0 0 412 210" preserveAspectRatio="none" role="img" aria-label="A paisagem">
      <defs><linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="{ceu_a}"/><stop offset="1" stop-color="{ceu_b}"/></linearGradient></defs>
      <rect width="412" height="210" fill="url(#ceu)"/>
      {astro}
      <path d="M0 150c70-22 120 14 206 2s136-30 206-12v70H0z" fill="{colina_a}"/>
      {fabrica}
      <path d="M0 182c80-16 130 12 206 4s130-22 206-6v34H0z" fill="{colina_b}"/>
    </svg>'''
