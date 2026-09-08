import { useCallback, useState } from 'react';
import { api } from './api';

export function useStats() {
  const [statMessages, setStatMessages] = useState(0);
  const [statContacts, setStatContacts] = useState(0);
  const [statAutoReplies, setStatAutoReplies] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [m, c, ar] = await Promise.all([api.messages(1), api.contacts(), api.autoReplies()]);
      setStatMessages(m.pagination.total);
      setStatContacts(c.data.length);
      setStatAutoReplies(ar.data.length);
    } catch {
      /* abaikan */
    }
  }, []);

  return { statMessages, statContacts, statAutoReplies, refresh };
}