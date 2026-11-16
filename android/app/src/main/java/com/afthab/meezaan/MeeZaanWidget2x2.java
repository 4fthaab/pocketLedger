package com.afthab.meezaan;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

public class MeeZaanWidget2x2 extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        PeriodicWorkRequest fetchWork = new PeriodicWorkRequest.Builder(BalanceWorker.class, 2, TimeUnit.HOURS).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("FetchBalances", ExistingPeriodicWorkPolicy.KEEP, fetchWork);

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_layout_2x2);

            Intent intent = new Intent(context, MeeZaanWidget2x2.class);
            intent.setAction("WIDGET_TAP_2X2");
            PendingIntent pi = PendingIntent.getBroadcast(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if ("WIDGET_TAP_2X2".equals(intent.getAction())) {
            SharedPreferences prefs = context.getSharedPreferences("MeeZaanWidgetPrefs", Context.MODE_PRIVATE);
            long lastClickTime = prefs.getLong("last_click_time_2x2", 0);
            long now = System.currentTimeMillis();

            if (now - lastClickTime < 500) {
                prefs.edit().putLong("reveal_until", now + 5000).putLong("last_click_time_2x2", 0).apply();
                triggerImmediateRefresh(context);

                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    triggerImmediateRefresh(context);
                }, 5000);
            } else {
                prefs.edit().putLong("last_click_time_2x2", now).apply();
                OneTimeWorkRequest nowWork = new OneTimeWorkRequest.Builder(BalanceWorker.class).build();
                WorkManager.getInstance(context).enqueue(nowWork);
            }
        }
    }

    private void triggerImmediateRefresh(Context context) {
        OneTimeWorkRequest nowWork = new OneTimeWorkRequest.Builder(BalanceWorker.class).build();
        WorkManager.getInstance(context).enqueue(nowWork);
    }
}