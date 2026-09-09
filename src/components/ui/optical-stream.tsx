import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Spacing } from '@/constants/theme';
import { createOpticalStream, encodeFrame } from '@/lib/optical';

// Match Decimen's default cadence. React Native may naturally drop a render on
// slower devices; fountain coding makes that harmless because every following
// frame remains independently useful.
export const OPTICAL_STREAM_FPS = 60;
const FRAME_INTERVAL_MS = Math.round(1000 / OPTICAL_STREAM_FPS);

type OpticalStreamProps = {
  serialized: string;
  sessionId: string;
  active?: boolean;
};

/** High-density, unbounded fountain stream inspired by Decimen's live canvas. */
export function OpticalStream({ serialized, sessionId, active = true }: OpticalStreamProps) {
  const { width } = useWindowDimensions();
  const [sequence, setSequence] = useState(0);
  const stream = useMemo(() => createOpticalStream(serialized, sessionId), [serialized, sessionId]);
  const qrSize = Math.min(width - Spacing.four * 2, 620);
  const currentFrame = useMemo(() => stream.frame(sequence), [sequence, stream]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setSequence(value => value + 1), FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  return (
    <View style={styles.shell} accessibilityLabel="Live Morrow optical stream">
      <View style={[styles.canvas, { width: qrSize, height: qrSize }]}>
        <QRCode
          value={encodeFrame(currentFrame)}
          size={qrSize}
          color="#000000"
          backgroundColor="#FFFFFF"
          quietZone={10}
          ecl="L"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { alignItems: 'center', gap: Spacing.three, width: '100%' },
  canvas: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});
