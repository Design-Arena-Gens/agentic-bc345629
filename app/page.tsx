import dynamic from "next/dynamic";
import styles from "./page.module.css";

const VoxelWorld = dynamic(() => import("./components/VoxelWorld"), {
  ssr: false,
  loading: () => <div className={styles.loading}>Loading VoxelCraft...</div>,
});

export default function Page() {
  return (
    <main className={styles.main}>
      <VoxelWorld />
    </main>
  );
}
