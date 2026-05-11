import styles from './not-found.module.scss';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.code}>404</div>
      <div className={styles.divider} />
      <div className={styles.message}>PAGE NOT FOUND</div>
    </div>
  );
}
