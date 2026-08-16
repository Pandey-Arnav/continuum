import { useEffect, useRef } from "react";
import { Animated } from "react-native";

// Replays a short fade+rise whenever `trigger` changes identity — used to
// give the pipeline result a visible "arrival" instead of popping in flat.
export function FadeSlideIn({ trigger, children }: { trigger: unknown; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trigger) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 340,
      useNativeDriver: true,
    }).start();
  }, [trigger, anim]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
