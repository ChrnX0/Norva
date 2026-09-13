/**
 * O encoder puro do `qrcode`, sem o resto da biblioteca.
 *
 * O pacote publica `lib/index.js` como entrada, e essa entrada carrega `fs`
 * para saber gravar arquivo - coisa que não existe no aparelho e derrubaria o
 * pacote inteiro no bundle nativo. O caminho `lib/core/qrcode.js` é só a
 * matemática: entra texto, sai a grade de módulos. Sem IO, sem plataforma.
 *
 * O `@types/qrcode` só descreve a fachada pública, então o tipo do núcleo é
 * declarado aqui - estreito de propósito, com exatamente o que este projeto usa.
 */
declare module 'qrcode/lib/core/qrcode.js' {
  export type QrCodeData = {
    modules: { size: number; data: Uint8Array };
    version: number;
  };

  export function create(
    text: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; version?: number },
  ): QrCodeData;
}
