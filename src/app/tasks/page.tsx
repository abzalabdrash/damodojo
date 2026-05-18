"use client";

import Link from "next/link";

import { AppSidebar } from "@/components/app-sidebar";

export default function TasksPage() {
  return (
    <div className="flex min-h-svh bg-[#302f2b] text-white">
      <AppSidebar />
      <main className="flex flex-1 items-center justify-center px-6">
        <section className="w-full max-w-xl rounded-lg border border-[#3b3832] bg-[#24231f] p-6 text-center shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#aaa49a]">
            Задачи
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            Скоро ежедневные позиции
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#c8c2b8]">
            Здесь будет тренировка по мотивам твоих партий: зевки, упущенные взятия и ключевые моменты от тренера.
          </p>
          <Link
            href="/play"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-[#7ab648] px-5 text-sm font-bold text-white transition hover:bg-[#85c34f]"
          >
            Сыграть партию
          </Link>
        </section>
      </main>
    </div>
  );
}
