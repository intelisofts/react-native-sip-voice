import { Text } from "react-native";
const Ionicons = ({ name, ...props }: any) => <Text {...props}>{`icon:${name}`}</Text>;
export default Ionicons;
