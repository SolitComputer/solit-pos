import { NextResponse } from "next/server";
import { supabase } from "@/services/supabase";

interface Props {
  params: Promise<{
    invoice: string;
  }>;
}

export async function GET(
  request: Request,
  props: Props
) {
  try {
    const params =
      await props.params;

    const { data, error } =
      await supabase
        .from("transactions")
        .select("*")
        .eq(
          "invoice_number",
          params.invoice
        )
        .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message:
            error.message,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message:
          String(error),
      },
      { status: 500 }
    );
  }
}