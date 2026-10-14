import QRCode from "qrcode";

export async function generateQrCodeDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 240,
      margin: 2,
      color: {
        dark: "#0c2738",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    return "";
  }
}
