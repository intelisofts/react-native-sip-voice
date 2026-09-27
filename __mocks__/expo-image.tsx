import { View } from "react-native";
export const Image = (props: any) => <View {...props} testID={props.testID ?? "expo-image"} />;
