import { BarChart } from "@mui/x-charts/BarChart";

interface Props {
  data: { month: string; income: number; expense: number }[];
  height: number;
  onBarClick?: (month: string) => void;
}

export default function MuiBarChart({ data, height, onBarClick }: Props) {
  // Convert to dataset-compatible format with index signature
  const dataset = data.map((d) => ({ ...d } as { [key: string]: string | number }));

  return (
    <BarChart
      dataset={dataset}
      xAxis={[{ scaleType: "band", dataKey: "month", tickLabelStyle: { fontSize: 11 } }]}
      yAxis={[{ tickLabelStyle: { fontSize: 11 } }]}
      series={[
        {
          dataKey: "income",
          label: "Venituri",
          color: "#22c55e",
          valueFormatter: (v) => v?.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) ?? "",
        },
        {
          dataKey: "expense",
          label: "Cheltuieli",
          color: "#ef4444",
          valueFormatter: (v) => v?.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) ?? "",
        },
      ]}
      height={height}
      borderRadius={4}
      onItemClick={(_event, barId) => {
        if (onBarClick && barId.dataIndex != null) {
          const item = data[barId.dataIndex];
          if (item) onBarClick(item.month);
        }
      }}
      sx={{ cursor: "pointer" }}
    />
  );
}
