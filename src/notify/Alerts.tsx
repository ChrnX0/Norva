import { useEffect } from 'react';
import { useLocale } from '@/i18n/useLocale';
import { rescheduleAlerts } from './index';
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

    // Falha aqui não vira erro na tela: o resultado é informativo, e o pior caso
    // é a fábrica não receber aviso — o aplicativo continua inteiro.
    void rescheduleAlerts(locale.timeZone, (alert) => alertPhrase(alert, t)).then(() => {
      if (!vivo) return;
    });

    return () => {
      vivo = false;
    };
  }, [locale.timeZone, t]);

  return null;
}
