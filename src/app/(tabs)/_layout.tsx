import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ColorValue } from 'react-native';

import { FloatingTabBar } from '@/components/ui/floating-tab-bar';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ outline, filled, color, focused }: { outline: IconName; filled: IconName; color: ColorValue; focused: boolean }) {
  return <Ionicons name={focused ? filled : outline} size={22} color={color as string} />;
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <TabIcon outline="home-outline" filled="home" color={color} focused={focused} /> }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: 'Receive',
          tabBarIcon: ({ color, focused }) => <TabIcon outline="wallet-outline" filled="wallet" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="send"
        options={{
          title: 'Send',
          tabBarIcon: ({ color, focused }) => <TabIcon outline="paper-plane-outline" filled="paper-plane" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, focused }) => <TabIcon outline="receipt-outline" filled="receipt" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
