// Roster tetap sales online — berbasis ID akun (users.id / filled_by).
// id = null artinya akunnya belum ketemu; isi setelah dapat ID-nya.
export interface RosterEntry {
    id: string | null;
    nama: string; // nama tampilan di kolom "Nama"
}

export const SALES_ROSTER: RosterEntry[] = [
    { id: "4610906c-4bd5-4678-875f-749db0787de6", nama: "David J. Sendouw" },
    { id: "a6ece814-7a1b-487d-b6f9-482498cfbddc", nama: "Dani" },
    { id: "a762ecd2-bdb7-4b42-b156-557b1d38a03c", nama: "Natasha" },
    { id: "6486de67-6866-4ec0-813c-6a71a0c6704c", nama: "Pawas" },
    { id: "7ad1b8af-6864-4fe8-a1c2-03985bea3048", nama: "Atha Diansyah" },
    { id: "3cdb5535-eb60-4f73-b6a2-77f8ba01b4ee", nama: "Davin" },
    { id: "10985807-7aca-41a2-acef-89558a786e70", nama: "Andika" },
    { id: "8517619c-4f29-4229-a006-17b2f1d10460", nama: "Rafi Pratama Febriansyah" },
    { id: "6368c5ed-a372-4246-8818-a3fa99c2b51e", nama: "Tengku M. Faturrahman" },
    { id: "5e5c4a80-0f3d-410c-9add-bd6f04b7ecb6", nama: "Seto" },
    { id: "e250c179-34af-4208-9f16-4872ad2933ae", nama: "Putri Shaliha Yasarah" },
    { id: "b4f81ee7-1d9e-4578-bddb-c1ce86ee878e", nama: "Awan" },
    { id: "a4f2ba9a-ef90-4123-b8a8-627e23b6f396", nama: "Randy Al Fariz" },
    { id: "11ca0428-656d-4ae3-a818-9acf2484ec4e", nama: "Bayu" },
    { id: "8786ce16-c8d0-4272-8709-3a943707e29f", nama: "Dzaky" },
    { id: "1b59e57c-94cf-4dd1-b5fb-7173ecb03cad", nama: "Andini Sazkia Putri" },
    { id: "8261e798-0fbd-4ebf-9513-b1dc80d65e33", nama: "Farrel Dewa Adrio" },
    { id: "6dad4a4c-71c9-4cab-aaa5-f1fce25b7b24", nama: "Dirga Riadmas" },
    { id: "495729ce-8299-4b88-8548-b79db34b2aad", nama: "Romadon Abdusalam" },
];


// Kunci penyimpanan (Akun/Device, catatan, warna) per orang — pakai ID kalau ada.
export function rosterKey(e: RosterEntry): string {
    return e.id ?? `name:${e.nama}`;
}