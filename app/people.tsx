import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphCustomer, GlyphStore } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { listPeople, listProfiles, savePerson, type Person, type Profile } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import type { Dictionary } from '@/i18n';
import { plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Quem trabalha aqui — a tabela que faltava atrás de `operator_id`.
 *
 * Esta porta estava na prancha do dono e ficou de fora com o motivo escrito em
 * `app/(tabs)/more.tsx`: *"`operator_id` é coluna sem tabela de gente atrás"*.
 * Gaveta que abre no vazio é pior que gaveta não desenhada. Agora tem o que
 * abrir.
 *
 * **Pessoa não é conta**, e é isto que o esquema estava dizendo errado. A `0035`
 * separa as duas com o raciocínio inteiro: `membership` exige `auth.users`, e
 * quem entra pela grade de nomes com PIN, de luva, no celular compartilhado da
 * empresa, não tem conta nenhuma e nunca vai ter. O login autentica o sistema; a
 * pessoa é anotação do registro.
 *
 * **O perfil aparece com o que ele pode fazer, não só com o nome.** Escolher
 * entre sete palavras sem saber o que cada uma libera é escolher no escuro — e
 * quem escolhe aqui é o dono da fábrica, não quem escreveu o vocabulário de
 * permissão. A frase de cada permissão diz o ATO, com o verbo na frente.
 *
 * Os sete papéis do produto entram como MODELOS na primeira abertura, com nome
 * vazio: "Entregador" é palavra de tela, em três idiomas. No dia em que o dono
 * renomear, o nome dele vence.
 */
export default function People() {
  return (
    <AreaProvider area="sky">
      <WhoWorksHere />
    </AreaProvider>
  );
}

type Loaded = { people: Person[]; profiles: Profile[] };

function WhoWorksHere() {
  const { color, type, space, palette, traco } = useTheme();
  const { t } = useLocale();
  const words = t.app.people;

  const { data, refresh } = useQuery<Loaded>(async () => {
    const [people, profiles] = await Promise.all([
      listPeople(LOCAL_COMPANY_ID),
      listProfiles(LOCAL_COMPANY_ID),
    ]);
    return { people, profiles };
  });

  const gente = data?.people ?? [];
  const perfis = data?.profiles ?? [];

  /** Nulo é a lista; `'novo'` é o cadastro; uma pessoa é a correção dela. */
  const [editando, setEditando] = useState<Person | 'novo' | null>(null);
  const [nome, setNome] = useState('');
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [fora, setFora] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const abrir = (quem: Person | 'novo') => {
    setEditando(quem);
    setNome(quem === 'novo' ? '' : quem.name);
    // Nenhum campo nasce vazio: o primeiro perfil da lista é o do dono, e a
    // pessoa nova quase nunca é ele - então o palpite é o segundo, que é quem
    // trabalha no chão. Com um perfil só, é ele mesmo.
    setPerfilId(quem === 'novo' ? (perfis[1]?.id ?? perfis[0]?.id ?? null) : quem.profileId);
    setFora(quem === 'novo' ? false : !quem.active);
  };

  const pronto = nome.trim().length > 0 && perfilId != null && !salvando;

  const salvar = async () => {
    if (!pronto || !perfilId) return;
    setSalvando(true);
    try {
      await savePerson(LOCAL_COMPANY_ID, {
        id: editando === 'novo' || editando === null ? undefined : editando.id,
        name: nome,
        profileId: perfilId,
        active: !fora,
      });
      setEditando(null);
      refresh();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      <Reveal index={0}>
        <Card
          hue={palette.sky}
          icon={(c) => <GlyphCustomer size={26} color={c} weight={traco} />}
          title={words.title}
        >
          {gente.length === 0 ? (
            <Text style={[type.body, { color: color.inkMuted }]}>{words.empty}</Text>
          ) : (
            gente.map((quem) => (
              <ListRow
                key={quem.id}
                label={quem.name}
                detail={nomeDoPerfil(perfis.find((p) => p.id === quem.profileId), t)}
                trailing={quem.active ? undefined : words.away}
                onPress={() => abrir(quem)}
              />
            ))
          )}

          {/* O convite explica PARA QUE serve cadastrar, e não só que dá para
              cadastrar: sem a frase, "Pessoas" é uma lista vazia que ninguém sabe
              por que preencher. */}
          {gente.length === 0 ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
              {words.emptyHint}
            </Text>
          ) : null}

          {editando === null ? (
            <Button
              label={words.add}
              variant="ghost"
              onPress={() => abrir('novo')}
              style={{ marginTop: space.md }}
            />
          ) : null}
        </Card>
      </Reveal>

      {editando !== null ? (
        <Reveal index={1}>
          <Card
            hue={palette.sky}
            icon={(c) => <GlyphCustomer size={26} color={c} weight={traco} />}
            title={editando === 'novo' ? words.add : nome}
          >
            <Field label={words.name} value={nome} onChangeText={setNome} autoFocus />

            <Text style={[type.overline, { color: color.inkFaint, marginTop: space.md }]}>
              {words.profile}
            </Text>
            <View style={[styles.wrap, { gap: space.sm, marginTop: space.sm }]}>
              {perfis.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPerfilId(p.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: p.id === perfilId }}
                  accessibilityLabel={nomeDoPerfil(p, t)}
                >
                  <Chip
                    signal={p.id === perfilId ? 'ok' : 'neutral'}
                    label={nomeDoPerfil(p, t)}
                  />
                </Pressable>
              ))}
            </View>

            {/* O que aquele perfil libera, colado na escolha. Sem isto a pessoa
                escolhe uma palavra; com isto ela escolhe um trabalho. */}
            {perfilId ? (
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
                {(perfis.find((p) => p.id === perfilId)?.capabilities ?? [])
                  .map((c) => t.app.capabilities[c].label)
                  .join(' · ')}
              </Text>
            ) : null}

            {editando !== 'novo' ? (
              <View style={{ marginTop: space.md }}>
                <Pressable
                  onPress={() => setFora(!fora)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: fora }}
                  accessibilityLabel={words.away}
                >
                  <Chip signal={fora ? 'warning' : 'neutral'} label={words.away} />
                </Pressable>
                <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
                  {words.awayHint}
                </Text>
              </View>
            ) : null}

            <Button
              label={words.save}
              onPress={salvar}
              disabled={!pronto}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : null}

      {/* Os perfis, com quantas pessoas vestem cada um.
          A contagem é o que responde a pergunta seguinte — "dá para mexer neste?"
          — antes de alguém tocar. Zero é estado válido e é o normal no começo. */}
      <Reveal index={2}>
        <Card
          hue={palette.sky}
          icon={(c) => <GlyphStore size={26} color={c} weight={traco} />}
          title={words.profilesTitle}
        >
          {perfis.map((p) => (
            <ListRow
              key={p.id}
              label={nomeDoPerfil(p, t)}
              detail={
                p.wearers === 0 ? words.nobody : plural(p.wearers, words.wearers)
              }
              trailing={plural(p.capabilities.length, words.canDo)}
            />
          ))}
        </Card>
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});

/**
 * O nome do perfil, com a regra de quem fala.
 *
 * Perfil semeado nasce sem nome porque o nome dele é uma palavra em três
 * idiomas — o mesmo desenho do lugar padrão. Renomeado, o nome do dono vence e a
 * tradução sai de cena. É por isso que o banco guarda `template_role` e não a
 * palavra: traduzir "Entregador" gravado seria traduzir o nome que alguém digitou.
 */
function nomeDoPerfil(perfil: Profile | undefined, t: Dictionary): string {
  if (!perfil) return '';
  if (perfil.name) return perfil.name;
  return perfil.templateRole ? t.app.roles[perfil.templateRole] : '';
}
