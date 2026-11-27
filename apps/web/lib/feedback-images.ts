export async function compressFeedbackImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15_000_000)
    throw Error("Use JPG, PNG ou WebP de até 15 MB por imagem.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw Error("Imagem muito grande. Recorte ou divida o print.");
    let scale = Math.min(
      1,
      4096 / bitmap.width,
      4096 / bitmap.height,
      Math.sqrt(16_000_000 / (bitmap.width * bitmap.height)),
    );
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw Error("Não foi possível preparar a imagem.");
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
      canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (blob && blob.size <= 900_000)
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(Error("Falha ao ler imagem."));
          reader.readAsDataURL(blob);
        });
      scale *= 0.8;
    }
    throw Error("Não foi possível comprimir o print. Recorte ou divida a imagem.");
  } finally {
    bitmap.close();
  }
}
