'use client';

import { useState } from 'react';

export function AdminNotificationForm() {
    const [title, setTitle] = useState('EasyManage');
    const [body, setBody] = useState('¡Tienes una nueva notificación!');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    async function handleSend() {
        setLoading(true);
        setResult(null);

        const res = await fetch('/api/send-notification', {
            method: 'POST',
            body: JSON.stringify({ title, body }),
            headers: { 'Content-Type': 'application/json' },
        });

        const data = await res.json();
        const sent = data.results?.filter((r: any) => r.status !== 'rejected').length || 0;
        const removed = data.results?.filter((r: any) => r.deleted).length || 0;

        setResult(`✅ Notificaciones enviadas: ${sent}, 🧹 eliminadas: ${removed}`);
        setLoading(false);
    }

    return (
        <div className="p-4 border rounded-lg shadow-sm space-y-4 bg-white">
            <h2 className="text-xl font-semibold">Enviar Notificación Push</h2>

            <div className="space-y-2">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Título"
                    className="w-full border p-2 rounded"
                />
                <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Mensaje"
                    className="w-full border p-2 rounded resize-none"
                    rows={3}
                />
            </div>

            <button
                onClick={handleSend}
                disabled={loading}
                className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
            >
                {loading ? 'Enviando...' : 'Enviar Notificación'}
            </button>

            {result && <p className="text-sm text-muted-foreground mt-2">{result}</p>}
        </div>
    );
}
