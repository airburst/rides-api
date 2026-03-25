CREATE TABLE "bcc_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"distance" integer,
	"external_url" text,
	"gpx" text,
	"map_image_url" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
