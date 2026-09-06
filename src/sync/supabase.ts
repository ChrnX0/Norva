import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * O cliente do servidor — e por que ele existe só agora.
 *
 * A decisão do dono era *"o servidor sobe o mais tarde possível"*, e ela valeu
 * até 6 de setembro por um motivo bom: sem caminho de escrita, provisionar
 * projeto é gastar por nada. O que a derrubou não foi impaciência, foi medida —
 * três coisas ficaram presas atrás dela ao mesmo tempo, e a lista está no
 * `docs/roadmap.md`: a aprovação de pedido que não atravessa, a configuração
 * que vale por aparelho, e a lista de gente sem a qual não há quem operou.
 *
 * **A chave publicável está no `app.json` de propósito, e isso não é descuido.**
 * Ela é publicável por desenho: vai dentro do APK, e qualquer pessoa com o
 * arquivo a extrai em um minuto. Quem protege o dado é a RLS, que é o que o
 * `db:verify` prova em dezessete garantias e o que o linter do servidor conferiu
 * quando as 39 migrações subiram. A chave que NÃO pode aparecer aqui — nem no
 * repositório, nem numa conversa — é a `service_role`, que passa por cima de
 * toda política; ela não é usada em lugar nenhum deste aplicativo.
 *
 * **A sessão mora no `AsyncStorage` e não na memória.** Uma fábrica não faz
 * login toda manhã: o aparelho fica no carregador da câmara fria e é ligado com
 * a luva. Sessão que morre ao fechar o app viraria uma tela de senha entre a
 * pessoa e a caixa que ela está segurando.
 *
 * **E `detectSessionInUrl` fica desligado** porque isto não é um navegador: a
 * ligação por link de e-mail chega por deep link, e o padrão da biblioteca é
 * para a web.
 */
const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseKey?: string }
  | undefined;

/**
 * Nulo quando o aplicativo roda sem servidor configurado — e isso é um estado
 * legítimo, não um defeito.
 *
 * O aplicativo inteiro funciona no aparelho: a fábrica offline na câmara fria é
 * o caso normal, e a fila guarda o que ela gravar. Um cliente ausente faz a
 * sincronia não acontecer, e nada mais.
 */
export const supabase: SupabaseClient | null =
  extra?.supabaseUrl && extra?.supabaseKey
    ? createClient(extra.supabaseUrl, extra.supabaseKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
