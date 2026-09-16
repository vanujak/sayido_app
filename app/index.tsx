import { Redirect } from "expo-router";
import { getVendorSession } from "@/lib/vendor-session";

export default function Index() {
  const session = getVendorSession();
  if (session.vendorId || session.email) {
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/login" />;
}

