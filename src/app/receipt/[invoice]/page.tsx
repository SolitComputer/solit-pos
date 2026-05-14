import { supabase }
from "@/services/supabase";

interface Props {
  params: Promise<{
    invoice: string;
  }>;
}

export default async function Page(
  props: Props
) {
  const params =
    await props.params;

  const { data } =
    await supabase
      .from(
        "transactions"
      )
      .select("*")
      .eq(
        "invoice_number",
        params.invoice
      )
      .single();

  return (
    <main className="min-h-screen bg-slate-100 p-5 flex justify-center items-center">
      <div className="bg-white rounded-3xl shadow-xl p-6 w-full max-w-md">

        <div className="text-center">
          <h1 className="text-4xl font-bold text-green-600">
            LUNAS
          </h1>

          <p className="text-slate-500 mt-2">
            Pembayaran
            berhasil
          </p>
        </div>

        <div className="border-t border-dashed my-5" />

        <div className="space-y-3 text-sm">

          <div className="flex justify-between">
            <span>
              Invoice
            </span>

            <span className="font-semibold">
              {
                data?.invoice_number
              }
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              Customer
            </span>

            <span className="font-semibold">
              {
                data?.customer_name
              }
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              Barang
            </span>

            <span className="font-semibold">
              {
                data?.laptop_name
              }
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              Total
            </span>

            <span className="font-semibold text-green-600">
              Rp
              {data?.amount?.toLocaleString(
                "id-ID"
              )}
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              Status
            </span>

            <span className="font-semibold text-green-600">
              {
                data?.status
              }
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}