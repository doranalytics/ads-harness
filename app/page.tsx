import { redirect } from "next/navigation";

// The harness opens on the Instagram feed.
export default function Home() {
  redirect("/organic");
}
