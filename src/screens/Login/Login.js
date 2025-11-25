import { Text, View } from "react-native";
import React, { use, useEffect } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, ScreenWrapper, TextField } from "@/components";
import { ms } from "@/utils";
import { fonts } from "@/theme";
import { useDispatch } from "react-redux";
import { login } from "@/redux/slices/userSlicer";
import { showErrorToast } from "@/components/ToastAlert";
import { multiply, initModel } from "modules/react-native-posedetection/src";

const Login = () => {
  const { theme } = useUnistyles();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const dispatch = useDispatch();

  useEffect(() => {
    // initModel();
  }, []);

  const onPressLogin = () => {
    if (email.trim() === "") {
      showErrorToast({ title: "Please enter email" });
      return;
    }

    if (password.trim() === "") {
      showErrorToast({ title: "Please enter password" });
      return;
    }

    const params = {
      email,
      password,
    };
    dispatch(login(params));
  };

  return (
    <ScreenWrapper style={styles.container}>
      <Text style={styles.title}>Login {multiply(2, 3)}</Text>
      <View style={{ marginVertical: ms(20) }}>
        <TextField
          placeholder="Enter your email"
          containerStyle={styles.textFieldContainer}
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          placeholder="Enter your password"
          secureTextEntry
          containerStyle={styles.textFieldContainer}
          value={password}
          onChangeText={setPassword}
        />
      </View>
      <Button
        type="primary"
        title="Sign in"
        style={styles.btnStyle}
        onPress={onPressLogin}
      />
    </ScreenWrapper>
  );
};

export default Login;

const styles = StyleSheet.create((theme) => ({
  container: {
    padding: ms(20),
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontFamily: fonts.openSan.bold, fontSize: ms(30) },
  textFieldContainer: { width: "100%" },
  btnStyle: { marginTop: ms(20) },
}));
