import { Suspense } from "react";
import CreatePaymentClient from "./CreatePaymentClient";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreatePaymentClient />
    </Suspense>
  );
}