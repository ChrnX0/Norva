import { useEffect } from 'react';
import { router } from 'expo-router';
import { useLocale } from '@/i18n/useLocale';
import { guardarPorQueNaoAgendou } from '@/data/repository';
import { aoTocarNoAviso, rescheduleAlerts } from './index';
import { alertPhrase } from './phrase';

/**
 * Quem manda reagendar os avisos: uma vez, quando o aplicativo abre.
 *
 * Sem este componente a regra de alarme seria peça sem chamador — exatamente a
 * doença que o P1 do `CLAUDE.md` descreve, e que este repositório já teve em
 * quatro lugares. Ele existe para ser o chamador, e não desenha nada.
 *
 * Abrir é o gancho certo, e não um temporizador: o dado muda quando alguém
 * registra alguma coisa, e quem registra abre o aplicativo. Um aviso agendado
 * ontem para a polpa que foi comprada hoje de manhã é o alerta que ensina a
 * ignorar alerta, então cada abertura recalcula e reagenda.
 *
 * A frase mora em `./phrase`, fora deste componente e fora do adaptador: quem
 * escreve português é a camada de idioma, e regra dentro de componente é regra
 * que nenhum teste importa — a cicatriz do `pickSuggestion`, que sobreviveu a
 * três rodadas de mutação por morar numa tela.
 */
export function Alerts() {
  const { locale, t } = useLocale();

  useEffect(() => {
    let vivo = true;

    // Falha aqui não vira erro na tela: o pior caso é a fábrica não receber aviso, e o
    // aplicativo continua inteiro. O que MUDOU é que o motivo deixa de morrer aqui: ele
    // é guardado para os Ajustes poderem dizer "o sistema não deixou" em vez de mostrar
    // interruptores ligados que não produzem nada.
    void rescheduleAlerts(
      locale.timeZone,
      (alert) => alertPhrase(alert, t),
      t.alertText.channel,
    ).then((r) => {
      if (!vivo) return;
      // **Só o que a pessoa PODE resolver vira recado**, e isso corta dois dos cinco
      // motivos. "Nada a avisar" é a fábrica em dia — dizer isso em Ajustes seria o
      // alerta inventado. E "sem suporte" é o navegador, onde notificação não existe:
      // recado sobre o que ninguém pode mudar é reclamação, e a Lei 5 diz que erro
      // impede ou cala.
      void guardarPorQueNaoAgendou(r.reason === 'sem-permissao' ? r.reason : null);
    });

    return () => {
      vivo = false;
    };
  }, [locale.timeZone, t]);

  /**
   * O toque no aviso, ligado à árvore de telas — as duas entradas do gesto.
   *
   * Separado do reagendamento de propósito: aquele depende do idioma e roda de novo
   * quando `t` muda; este é uma inscrição no sistema operacional e tem de existir UMA
   * vez, senão o toque frio é atendido duas.
   */
  useEffect(() => {
    let desligar: (() => void) | null = null;
    let vivo = true;

    void aoTocarNoAviso((rota) => router.push(rota as never)).then((parar) => {
      if (!vivo) {
        parar();
        return;
      }
      desligar = parar;
    });

    return () => {
      vivo = false;
      desligar?.();
    };
  }, []);

  return null;
}
