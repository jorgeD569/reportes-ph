/**
 * Base64 sin prefijo data:image/...;base64,
 * igual que legacy `fileToBase64` en operador INDEX.HTML.
 */
export async function fileToBase64Pure(file: File | null): Promise<string | null> {
  if (!file) return null

  return await new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('No se pudo procesar la imagen'))
        return
      }

      const parts = result.split(',')
      if (parts.length < 2) {
        reject(new Error('Formato base64 inválido'))
        return
      }

      resolve(parts[1])
    }

    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsDataURL(file)
  })
}
