import { Text } from "react-native";
import React from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, ScreenWrapper } from "@/components";
import { fonts } from "@/theme";
import { ms } from "@/utils";
import { useDispatch } from "react-redux";
import { logout } from "@/redux/actions/authAction";

const Home = () => {
  const { theme } = useUnistyles();
  const dispatch = useDispatch();
  const onPressLogout = () => {
    dispatch(logout());
  };

  return (
    <ScreenWrapper style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Button title="Logout" style={styles.btnStyle} onPress={onPressLogout} />
    </ScreenWrapper>
  );
};

export default Home;

const styles = StyleSheet.create((theme) => ({
  container: {
    padding: ms(20),
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontFamily: fonts.openSan.bold, fontSize: ms(30) },
  btnStyle: { marginTop: ms(40) },
}));
