"use client";

import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";

import type { CampaignRow } from "@/components/campaigns/types";
import { createCampaign, updateCampaign } from "@/lib/actions/campaigns";
import {
  campaignSchema,
  type CampaignFormValues,
} from "@/lib/campaigns/form-schema";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
} from "@/lib/campaigns/types";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

function toFormValues(campaign?: CampaignRow): CampaignFormValues {
  return {
    name: campaign?.name ?? "",
    type: campaign?.type ?? "launch",
    status: campaign?.status ?? "planning",
    start_date: campaign?.start_date ?? "",
    end_date: campaign?.end_date ?? "",
    notes: campaign?.notes ?? "",
  };
}

const resolver = standardSchemaResolver(
  campaignSchema,
) as unknown as Resolver<CampaignFormValues>;

export function CampaignForm({
  campaign,
  onSuccess,
  onCancel,
}: {
  campaign?: CampaignRow;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const isEdit = !!campaign;

  const form = useForm<CampaignFormValues>({
    resolver,
    defaultValues: toFormValues(campaign),
  });

  function onSubmit(values: CampaignFormValues) {
    startTransition(async () => {
      const result = isEdit
        ? await updateCampaign(campaign.id, values)
        : await createCampaign(values);

      if (result.ok) {
        toast.success(isEdit ? "Campaign updated" : "Campaign created");
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign name</FormLabel>
              <FormControl>
                <Input placeholder="Spring launch email series" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <FormControl>
                  <Select {...field}>
                    {CAMPAIGN_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CAMPAIGN_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <FormControl>
                  <Select {...field}>
                    {CAMPAIGN_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {CAMPAIGN_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Offer details, audience, KPI targets..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!isEdit ? (
          <FormDescription>
            A starter checklist is added based on campaign type. Set a start date
            to auto-schedule task due dates.
          </FormDescription>
        ) : null}

        <div className="mt-2 flex justify-end gap-2">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending
              ? isEdit
                ? "Saving..."
                : "Creating..."
              : isEdit
                ? "Save changes"
                : "Create campaign"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
