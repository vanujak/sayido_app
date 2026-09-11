import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  DimensionValue,
  Easing,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export interface ShimmerProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  baseColor?: string;
  highlightColor?: string;
  duration?: number;
  animatedValue?: Animated.Value;
}

export function Shimmer({
  width = "100%",
  height = 16,
  borderRadius = 8,
  style,
  baseColor = "#EAECEF",
  highlightColor = "rgba(255, 255, 255, 0.75)",
  duration = 1300,
  animatedValue: externalAnimatedValue,
}: ShimmerProps) {
  const [layoutWidth, setLayoutWidth] = useState<number>(0);
  const internalAnimatedValue = useRef(new Animated.Value(0)).current;
  const animValue = externalAnimatedValue || internalAnimatedValue;

  useEffect(() => {
    if (externalAnimatedValue) return;

    const animation = Animated.loop(
      Animated.timing(animValue, {
        toValue: 1,
        duration,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [animValue, duration, externalAnimatedValue]);

  const onLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0 && w !== layoutWidth) {
      setLayoutWidth(w);
    }
  };

  const sweepWidth = layoutWidth > 0 ? layoutWidth : 200;
  const translateX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-sweepWidth, sweepWidth * 1.5],
  });

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.shimmerContainer,
        {
          width,
          height,
          borderRadius,
          backgroundColor: baseColor,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            width: "100%",
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={["transparent", highlightColor, "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function ShimmerCircle({
  size = 40,
  style,
  ...props
}: Omit<ShimmerProps, "width" | "height" | "borderRadius"> & { size?: number }) {
  return (
    <Shimmer
      width={size}
      height={size}
      borderRadius={size / 2}
      style={style}
      {...props}
    />
  );
}

export function ShimmerText({
  width = "100%",
  height = 14,
  borderRadius = 6,
  style,
  ...props
}: ShimmerProps) {
  return (
    <Shimmer
      width={width}
      height={height}
      borderRadius={borderRadius}
      style={style}
      {...props}
    />
  );
}

export function ShimmerCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  shimmerContainer: {
    overflow: "hidden",
    position: "relative",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F0F2F5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
});
