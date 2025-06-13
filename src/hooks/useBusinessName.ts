// hooks/useBusinessName.ts
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useBusinessName() {
    const [businessName, setBusinessName] = useState('');

    useEffect(() => {
        const fetchName = async () => {
            const docRef = doc(db, 'appSettings', 'businessName');
            const snapshot = await getDoc(docRef);
            if (snapshot.exists()) {
                const data = snapshot.data();
                setBusinessName(data.name || data.default);
            }
        };
        fetchName();
    }, []);

    return businessName;
}
