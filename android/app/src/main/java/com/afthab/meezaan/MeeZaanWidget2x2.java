package com.afthab.meezaan;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

public class MeeZaanWidget2x2 extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        PeriodicWorkRequest fetchWork = new PeriodicWorkRequest.Builder(BalanceWorker.class, 2, TimeUnit.HOURS).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("FetchBalances", ExistingPeriodicWorkPolicy.KEEP, fetchWork);

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_layout_2x2);

            Intent intent = new Intent(context, MeeZaanWidget2x2.class);
            intent.setAction("REFRESH_ACTION_2X2");
            PendingIntent pi = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if ("REFRESH_ACTION_2X2".equals(intent.getAction())) {
            OneTimeWorkRequest now = new OneTimeWorkRequest.Builder(BalanceWorker.class).build();
            WorkManager.getInstance(context).enqueue(now);
        }
    }
}