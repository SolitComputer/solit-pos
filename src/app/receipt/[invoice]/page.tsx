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

    if (
        !data ||
        data.status !==
        "PAID"
    ) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-slate-100 p-5">
                <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md text-center">

                    <h1 className="text-2xl font-bold text-orange-500">
                        Menunggu Pembayaran
                    </h1>

                    <p className="text-slate-500 mt-2">
                        Pembayaran
                        belum
                        dikonfirmasi.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-100 py-8 px-4 flex justify-center">

            <div className="bg-white rounded-[32px] shadow-2xl overflow-hidden max-w-md w-full">

                {/* HEADER */}
                <div className="bg-gradient-to-r from-blue-950 to-slate-900 text-white p-6">

                    <div className="flex justify-between items-start">

                        <div>
                            <h1 className="text-2xl font-bold">
                                SOLIT 03
                            </h1>

                            <p className="text-sm text-slate-300">
                                Sawangan,
                                Depok
                            </p>
                        </div>

                        <div className="bg-green-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                            LUNAS
                        </div>
                    </div>

                    <div className="mt-5">
                        <p className="text-slate-400 text-sm">
                            Invoice
                        </p>

                        <h2 className="font-bold text-lg">
                            {
                                data.invoice_number
                            }
                        </h2>
                    </div>
                </div>

                {/* BODY */}
                <div className="p-6 space-y-6">

                    {/* CUSTOMER */}
                    <section>
                        <h3 className="font-bold text-slate-900 mb-3">
                            Customer
                        </h3>

                        <div className="space-y-2 text-sm">

                            <Info
                                label="Nama"
                                value={
                                    data.customer_name
                                }
                            />

                            <Info
                                label="WhatsApp"
                                value={
                                    data.customer_phone
                                }
                            />

                            <Info
                                label="Perusahaan"
                                value={
                                    data.company_name ||
                                    "-"
                                }
                            />
                        </div>
                    </section>

                    <div className="border-t border-dashed" />

                    {/* LAPTOP */}
                    <section>
                        <h3 className="font-bold text-slate-900 mb-3">
                            Detail Laptop
                        </h3>

                        <div className="space-y-2 text-sm">

                            <Info
                                label="Laptop"
                                value={
                                    data.laptop_name
                                }
                            />

                            <Info
                                label="Serial Number"
                                value={
                                    data.serial_number ||
                                    "-"
                                }
                            />

                            <Info
                                label="Software"
                                value={
                                    data.software_request ||
                                    "-"
                                }
                            />
                        </div>
                    </section>

                    <div className="border-t border-dashed" />

                    {/* PENGAMBILAN */}
                    <section>
                        <h3 className="font-bold text-slate-900 mb-3">
                            Pengambilan
                        </h3>

                        <div className="space-y-2 text-sm">

                            <Info
                                label="Metode"
                                value={
                                    data.pickup_method
                                }
                            />

                            <Info
                                label="Tanggal"
                                value={
                                    data.pickup_date ||
                                    "-"
                                }
                            />

                            <Info
                                label="Jam"
                                value={
                                    data.pickup_time ||
                                    "-"
                                }
                            />

                            <Info
                                label="Lokasi"
                                value={
                                    data.pickup_location ||
                                    "-"
                                }
                            />
                        </div>
                    </section>

                    <div className="border-t border-dashed" />

                    {/* PEMBAYARAN */}
                    <section>
                        <h3 className="font-bold text-slate-900 mb-3">
                            Pembayaran
                        </h3>

                        <div className="space-y-2 text-sm">

                            <Info
                                label="Metode"
                                value={
                                    data.payment_method
                                }
                            />

                            <Info
                                label="Status"
                                value={
                                    data.status
                                }
                            />

                            <div className="flex justify-between items-center mt-4 bg-green-50 p-4 rounded-2xl">

                                <span className="font-medium">
                                    Total
                                </span>

                                <span className="text-2xl font-bold text-green-600">
                                    Rp
                                    {data.amount?.toLocaleString(
                                        "id-ID"
                                    )}
                                </span>
                            </div>
                        </div>
                    </section>
                </div>

                {/* FOOTER */}
                <div className="bg-slate-50 p-5 text-center border-t">

                    <p className="font-semibold">
                        Terima kasih
                    </p>

                    <p className="text-sm text-slate-500 mt-1">
                        Sudah
                        berbelanja
                        di Solit 03
                    </p>
                </div>
            </div>
        </main>
    );
}

function Info({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-slate-500">
                {label}
            </span>

            <span className="font-medium text-right">
                {value}
            </span>
        </div>
    );
}