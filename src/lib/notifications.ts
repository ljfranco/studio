export async function sendStockAlert(product: { name: string; stock: number }) {
  try {
    await fetch('/api/send-notification', {
      method: 'POST',
      body: JSON.stringify({
        title: `⚠️ Stock bajo "${product.name}"`,
        body: `Quedan solo ${product.stock} unidades de "${product.name}".`,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.log(`🔔 Notificación enviada para ${product.name}`);
  } catch (error) {
    console.error(`❌ Error al enviar notificación para ${product.name}:`, error);
  }
}