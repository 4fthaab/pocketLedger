package com.afthab.meezaan;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.widget.RemoteViews;

public class BalanceWorker extends Worker {
    public BalanceWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        
        // Read balances saved by the React App
        SharedPreferences prefs = context.getSharedPreferences("MeeZaanWidgetPrefs", Context.MODE_PRIVATE);
        float sbi = prefs.getFloat("sbi", 0f);
        float fed = prefs.getFloat("fed", 0f);
        float cash = prefs.getFloat("cash", 0f);
        float total = prefs.getFloat("total", 0f);

        updateUI(context, (double) sbi, (double) fed, (double) cash, (double) total);
        return Result.success();
    }

    public static void updateUI(Context context, Double sbi, Double fed, Double cash, Double total) {
        String time = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(new java.util.Date());
        AppWidgetManager wm = AppWidgetManager.getInstance(context);

        SharedPreferences prefs = context.getSharedPreferences("MeeZaanWidgetPrefs", Context.MODE_PRIVATE);
        long revealUntil = prefs.getLong("reveal_until", 0);
        boolean isRevealed = System.currentTimeMillis() < revealUntil;

        RemoteViews views1x4 = new RemoteViews(context.getPackageName(), R.layout.widget_layout);
        setupViews(views1x4, sbi, fed, cash, total, time, isRevealed);
        wm.updateAppWidget(new ComponentName(context, MeeZaanWidget.class), views1x4);

        RemoteViews views2x2 = new RemoteViews(context.getPackageName(), R.layout.widget_layout_2x2);
        setupViews(views2x2, sbi, fed, cash, total, time, isRevealed);
        wm.updateAppWidget(new ComponentName(context, MeeZaanWidget2x2.class), views2x2);
    }

    private static void setupViews(RemoteViews views, Double sbi, Double fed, Double cash, Double total, String time, boolean isRevealed) {
        views.setTextViewText(R.id.val_sbi, "₹" + sbi.intValue());

        if (isRevealed) {
            views.setTextViewText(R.id.val_federal, "₹" + fed.intValue());
            views.setTextViewText(R.id.val_cash, "₹" + cash.intValue());
            views.setTextViewText(R.id.val_total, "₹" + total.intValue());
        } else {
            views.setTextViewText(R.id.val_federal, "xxxx.xx");
            views.setTextViewText(R.id.val_cash, "xxxx.xx");
            views.setTextViewText(R.id.val_total, "xxxx.xx");
        }
        views.setTextViewText(R.id.timestamp, "Last sync: " + time);
    }
}