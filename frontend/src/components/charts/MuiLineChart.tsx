import { LineChart } from "@mui/x-charts/LineChart";

interface Props {
  data: { month: string; total: number }[];
  height: number;
  color: string;
  label?: string;
}

export default function MuiLineChart({ data, height, color, label = "Total" }: Props) {
  const dataset = data.map((d) => ({ ...d } as { [key: string]: string | number }));

  return (
    <LineChart
      dataset={dataset}
      xAxis={[{ scaleType: "band", dataKey: "month", tickLabelStyle: { fontSize: 10 } }]}
      yAxis={[{ tickLabelStyle: { fontSize: 10 } }]}
      series={[
        {
          dataKey: "total",
          label,
          color,
          showMark: true,
          valueFormatter: (v) => v?.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) ?? "",
        },
      ]}
      height={height}
      hideLegend
    />
  );
}
