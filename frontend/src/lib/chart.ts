import { Chart } from 'chart.js/auto';
import type { ChartPoint } from './api';

export function createActivityChart(canvas: HTMLCanvasElement, points: ChartPoint[]) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map((d) => d.date),
      datasets: [
        {
          label: 'Pesan Masuk',
          data: points.map((d) => d.inbound),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.35,
        },
        {
          label: 'Pesan Keluar',
          data: points.map((d) => d.outbound),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9ca3af' } } },
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    },
  });
}