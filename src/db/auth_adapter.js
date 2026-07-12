const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

module.exports = async function usePostgresAuthState(pool, sessionId = 'default') {
    const writeData = async (data, id) => {
        const info = JSON.stringify(data, BufferJSON.replacer);
        await pool.query(
            'INSERT INTO wa_sessions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
            [`${sessionId}-${id}`, info]
        );
    };

    const readData = async (id) => {
        try {
            const res = await pool.query('SELECT data FROM wa_sessions WHERE id = $1', [`${sessionId}-${id}`]);
            if (res.rows.length > 0 && res.rows[0].data) {
                return JSON.parse(res.rows[0].data, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error('Error reading auth state from DB:', error);
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await pool.query('DELETE FROM wa_sessions WHERE id = $1', [`${sessionId}-${id}`]);
        } catch (error) {
            console.error('Error removing auth state from DB:', error);
        }
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};
