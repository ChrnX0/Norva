import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readMeta, writeMeta } from '@/data/meta';
import type { Hue, Skin } from './tokens';

const KEY = 'appearance.skin';
const HUE_KEY = 'appearance.hue';

/**
 * Qual das duas caras o aplicativo está usando.
 *
 * **É preferência do APARELHO, não da empresa**, e a diferença importa: o
 * `company_id` manda no que é fato do negócio — se pedido precisa de aprovação,
 * se o relatório nomeia quem registrou. A cara da tela não é fato do negócio, é
 * de quem está segurando o celular: o dono no escritório e o operador na câmara
 * fria podem querer coisas diferentes no mesmo dia, e nenhum dos dois está
 * errado.
 *
 * Por isso mora no `meta`, que é a gaveta local do aparelho, e não sobe na fila
 * de sincronização. Trocar a cara aqui não escreve nada no servidor, não gera
 * movimento e não aparece para mais ninguém.
 *
 * O padrão é o **Orgânico**, e a escolha do padrão é do dono: foi a identidade
 * que ele apontou primeiro entre as duas.
 */
type Appearance = {
  skin: Skin;
  setSkin: (skin: Skin) => void;
  /**
   * A paleta da paisagem. Só o Orgânico a usa — o Papel tem uma cara só, que é
   * a graça dele: revista impressa não vem em cinco cores de capa.
   */
  hue: Hue;
  setHue: (hue: Hue) => void;
  /** Falso enquanto a gaveta ainda não respondeu. */
  ready: boolean;
};

const HUES: Hue[] = ['verde', 'azul', 'ambar', 'terracota', 'lavanda'];

const AppearanceContext = createContext<Appearance | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [skin, setState] = useState<Skin>('organico');
  const [hue, setHueState] = useState<Hue>('verde');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readMeta(KEY), readMeta(HUE_KEY)])
      .then(([savedSkin, savedHue]) => {
        if (cancelled) return;
        if (savedSkin === 'papel' || savedSkin === 'organico') setState(savedSkin);
        if (savedHue && (HUES as string[]).includes(savedHue)) setHueState(savedHue as Hue);
      })
      // A cara é enfeite; falhar a leitura não pode impedir o aplicativo de
      // abrir. Sem resposta da gaveta, vale o padrão.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSkin = useCallback((next: Skin) => {
    // A tela troca na hora e a gravação vai atrás: esperar o disco para mudar
    // uma cor faria o toque parecer travado.
    setState(next);
    void writeMeta(KEY, next).catch(() => undefined);
  }, []);

  const setHue = useCallback((next: Hue) => {
    setHueState(next);
    void writeMeta(HUE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ skin, setSkin, hue, setHue, ready }),
    [skin, setSkin, hue, setHue, ready],
  );
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/**
 * A cara escolhida, com um padrão que funciona fora do provedor.
 *
 * Fora dele — na tela de erro, que sobe antes de tudo — a resposta é o padrão
 * em vez de uma exceção: um aplicativo que quebra ao desenhar a tela de quebra
 * não tem como se explicar.
 */
export function useAppearance(): Appearance {
  return (
    useContext(AppearanceContext) ?? {
      skin: 'organico',
      setSkin: () => undefined,
      hue: 'verde',
      setHue: () => undefined,
      ready: true,
    }
  );
}
