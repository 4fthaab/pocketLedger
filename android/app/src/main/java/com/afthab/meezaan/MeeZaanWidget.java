package com.afthab.meezaan;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

public class MeeZaanWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        // 1. Schedule the 2-hour periodic update
        PeriodicWorkRequest fetchWork = new PeriodicWorkRequest.Builder(BalanceWorker.class, 2, TimeUnit.HOURS).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("FetchBalances", ExistingPeriodicWorkPolicy.KEEP, fetchWork);

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_layout);

            // 2. Setup Click-to-Refresh
            Intent intent = new Intent(context, MeeZaanWidget.class);
            intent.setAction("REFRESH_ACTION");
            PendingIntent pi = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if ("REFRESH_ACTION".equals(intent.getAction())) {
            // Trigger an immediate one-time fetch when tapped
            OneTimeWorkRequest now = new OneTimeWorkRequest.Builder(BalanceWorker.class).build();
            WorkManager.getInstance(context).enqueue(now);
        }
    }
}