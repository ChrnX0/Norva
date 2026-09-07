import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphVehicle } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { useConfirm } from '@/components/Confirm';
import { currentCapabilities, listCarriers, saveCarrier, type Carrier } from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Quem leva a carga, quando não é o carro da fábrica.
 *
 * **Levantado pelo dono, e era a única das quatro "quebras de porte" que não
 * existia.** Nenhuma linha do repositório falava de transportadora: havia
 * `vehicle` como espécie de lugar e `driver` como papel, e nada que se
 * cadastrasse.
 *
 * **Ela não é um lugar.** O docblock das espécies decide o caso vizinho —
 * *"caminhão é caminho, não é sala nem destino"* —, e uma transportadora é menos
 * ainda: é uma empresa com telefone. Carga em cima dela não está numa sala nossa
 * e não chegou a ninguém.
 *
 * **E não se apaga: sai de uso.** O que ela já levou continua no livro-razão com
 * o nome dela, e apagar a linha levaria a chave estrangeira do movimento junto.
 * É a mesma regra da pessoa que sai da fábrica.
 */
export default function Carriers() {
  return (
    <AreaProvider area="lilac">
      <QuemLeva />
    </AreaProvider>
  );
}

type Loaded = {
  carriers: Carrier[];
  /** Quem não administra LÊ a lista; quem recusa de verdade é `saveCarrier`. */
  administra: boolean;
};

function QuemLeva() {
  const { color, type, space, palette, traco } = useTheme();
  const { t } = useLocale();
  const words = t.app.transport;
  const confirm = useConfirm();

  const { data, refresh } = useQuery<Loaded>(async () => {
    const [carriers, capacidades] = await Promise.all([
      listCarriers(empresaDaqui()),
      currentCapabilities(empresaDaqui()),
    ]);
    return { carriers, administra: capacidades.has('manage_company') };
  });

  const transportadoras = data?.carriers ?? [];
  const administra = data?.administra === true;

  /** Nulo é a lista; `'nova'` é o cadastro; uma transportadora é a correção dela. */
  const [editando, setEditando] = useState<Carrier | 'nova' | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);

  const abrir = (quem: Carrier | 'nova') => {
    setEditando(quem);
    setNome(quem === 'nova' ? '' : quem.name);
    setTelefone(quem === 'nova' ? '' : (quem.phone ?? ''));
  };

  const pronto = nome.trim().length > 0 && !salvando;

  const salvar = async () => {
    if (!pronto) return;
    setSalvando(true);
    try {
      await saveCarrier(empresaDaqui(), {
        id: editando === 'nova' || editando === null ? undefined : editando.id,
        name: nome,
        phone: telefone,
        active: editando === 'nova' || editando === null ? true : editando.active,
      });
      setEditando(null);
      refresh();
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Tirar de uso — uma confirmação, não duas.
   *
   * Nada se perde: a transportadora sai da lista de escolha e o que ela levou
   * continua no registro com o nome dela. O eixo desta casa é irrecuperável, e
   * isto se desfaz tocando de novo.
   */
  const tirarDeUso = async (quem: Carrier) => {
    const vai = await confirm({
      title: words.carrierRetire,
      message: words.carrierRetireAsk,
      confirmLabel: t.app.confirm.confirm,
    });
    if (!vai) return;
    await saveCarrier(empresaDaqui(), { id: quem.id, name: quem.name, active: !quem.active });
    refresh();
  };

  return (
    <CollapsingHeader cena="transporte" title={words.carrierTitle} overline={words.carrierHint}>
      <Reveal index={0}>
        <Card hue={palette.lilac} icon={(c) => <GlyphVehicle size={26} color={c} weight={traco} />}>
          {transportadoras.length === 0 ? (
            <Text style={[type.body, { color: color.inkMuted }]}>{words.carrierNone}</Text>
          ) : (
            transportadoras.map((quem) => (
              <ListRow
                key={quem.id}
                label={quem.name}
                detail={quem.phone ?? undefined}
                trailing={quem.active ? undefined : words.carrierRetired}
                onPress={administra ? () => abrir(quem) : undefined}
              />
            ))
          )}

          {editando === null && administra ? (
            <Button
              label={words.carrierAdd}
              variant="ghost"
              onPress={() => abrir('nova')}
              style={{ marginTop: space.md }}
            />
          ) : null}

          {administra ? null : (
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
              {words.carrierOnlyAdmin}
            </Text>
          )}
        </Card>
      </Reveal>

      {editando !== null ? (
        <Reveal index={1}>
          <Card
            hue={palette.lilac}
            icon={(c) => <GlyphVehicle size={26} color={c} weight={traco} />}
            title={editando === 'nova' ? words.carrierAdd : nome}
          >
            <Field label={words.carrierName} value={nome} onChangeText={setNome} autoFocus />
            <Field
              label={words.carrierPhone}
              value={telefone}
              onChangeText={setTelefone}
              keyboardType="phone-pad"
            />

            {editando !== 'nova' ? (
              <Pressable
                onPress={() => void tirarDeUso(editando)}
                accessibilityRole="switch"
                accessibilityState={{ checked: !editando.active }}
                accessibilityLabel={words.carrierRetire}
                style={{ marginTop: space.md }}
              >
                <Chip
                  signal={editando.active ? 'neutral' : 'warning'}
                  label={editando.active ? words.carrierRetire : words.carrierRetired}
                />
              </Pressable>
            ) : null}

            <Button
              label={words.carrierSave}
              onPress={() => void salvar()}
              disabled={!pronto}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}
