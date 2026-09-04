import { redirect } from "next/navigation";

/** Personal install: the training plan is the product and the home screen. */
export default function Home() {
  redirect("/plan");
}
