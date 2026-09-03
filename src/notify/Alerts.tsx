import { useEffect } from 'react';
import { fill, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { rescheduleAlerts } from './index';
import type { Alert } from '@/domain/alerts';

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
 * A frase mora AQUI e não no adaptador porque quem escreve português é a camada
 * de idioma — a mesma fundação que mantém a camada de dados devolvendo fato.
 */
export function Alerts() {
  const { locale, t } = useLocale();

  useEffect(() => {
    let vivo = true;

    const frase = (alert: Alert): { title: string; body: string } => {
      const words = t.alertText[alert.kind];
      const dias = plural(Math.max(0, Math.floor(alert.amount)), t.app.home.dayCount);
      const amount =
        alert.kind === 'insumo' || alert.kind === 'validade'
          ? dias
          : String(Math.round(alert.amount));
      return {
        title: fill(words.title, {
          subject: alert.subject,
          amount,
          places: alert.places === undefined ? '' : plural(alert.places, t.app.home.placeCount),
        }),
        body: fill(words.body, {
          subject: alert.subject,
          amount,
          unit: alert.unit ?? '',
        }),
      };
    };

    // Falha aqui não vira erro na tela: o resultado é informativo, e o pior caso
    // é a fábrica não receber aviso — o aplicativo continua inteiro.
    void rescheduleAlerts(locale.timeZone, frase).then(() => {
      if (!vivo) return;
    });

    return () => {
      vivo = false;
    };
  }, [locale.timeZone, t]);

  return null;
}
