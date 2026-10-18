'use client';
import { FlowScreen } from '@/components/FlowTransition';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import { useTranslation } from '@/context/LanguageContext';
import styles from './KalasWelcome.module.css';

/**
 * GH-571 (D0281): ROLLER's API never checks in a kalas (party package), so the phone does not start one. A kalas
 * guest who looks up or opens a kalas booking gets a glad screen that sends them to the staff instead.
 */
export const KalasWelcome = ({ onDone }: { onDone: () => void }) => {
    const { t } = useTranslation();
    return (
        <FlowScreen className={styles.screen} data-testid="kalas-welcome" role="status"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <header className={styles.hero}>
                <span className={styles.badge}><JumpyardIcon name="reward-gift" className={styles.icon} /></span>
                <h1>{t.lookup.kalasTitle}</h1>
            </header>
            <div className={styles.body}><p>{t.lookup.kalasBody}</p></div>
            <div className={styles.footer}>
                <button type="button" data-testid="kalas-welcome-done" onClick={onDone}>{t.lookup.kalasDone}</button>
            </div>
        </FlowScreen>
    );
};
