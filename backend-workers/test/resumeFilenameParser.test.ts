import { describe, expect, it } from "vitest";
import { parseResumeFilename } from "../src/utils/resumeFilenameParser";

describe("resumeFilenameParser — Shared Recruiter Filename Parser", () => {
  it("extracts Rachana_SpatialFront_ServiceNow_Developer_Resume.pdf correctly", () => {
    const res = parseResumeFilename("Rachana_SpatialFront_ServiceNow_Developer_Resume.pdf");
    expect(res.candidateName).toBe("Rachana");
    expect(res.hiringOrganization).toBe("SpatialFront");
    expect(res.targetRole).toBe("ServiceNow Developer");
    expect(res.confidence).toBe("high");
  });

  it("extracts Harish_TCS_Java_Developer.pdf correctly", () => {
    const res = parseResumeFilename("Harish_TCS_Java_Developer.pdf");
    expect(res.candidateName).toBe("Harish");
    expect(res.hiringOrganization).toBe("TCS");
    expect(res.targetRole).toBe("Java Developer");
    expect(res.confidence).toBe("high");
  });

  it("extracts Anjali_Infosys_Data_Analyst_Final.pdf correctly stripping Final", () => {
    const res = parseResumeFilename("Anjali_Infosys_Data_Analyst_Final.pdf");
    expect(res.candidateName).toBe("Anjali");
    expect(res.hiringOrganization).toBe("Infosys");
    expect(res.targetRole).toBe("Data Analyst");
    expect(res.confidence).toBe("high");
  });

  it("extracts Anjali_Infosys_Data_Analyst_Resume.pdf correctly", () => {
    const res = parseResumeFilename("Anjali_Infosys_Data_Analyst_Resume.pdf");
    expect(res.candidateName).toBe("Anjali");
    expect(res.hiringOrganization).toBe("Infosys");
    expect(res.targetRole).toBe("Data Analyst");
    expect(res.confidence).toBe("high");
  });

  it("extracts sreya_TwoSixTechnologies_Senior_DevOps_Engineer_Resume-1.pdf correctly stripping Resume-1", () => {
    const res = parseResumeFilename("sreya_TwoSixTechnologies_Senior_DevOps_Engineer_Resume-1.pdf");
    expect(res.candidateName).toBe("Sreya");
    expect(res.hiringOrganization).toBe("TwoSixTechnologies");
    expect(res.targetRole).toBe("Senior DevOps Engineer");
    expect(res.confidence).toBe("high");
  });

  it("extracts Rahul_Amazon_SDE2.pdf correctly formatting SDE2", () => {
    const res = parseResumeFilename("Rahul_Amazon_SDE2.pdf");
    expect(res.candidateName).toBe("Rahul");
    expect(res.hiringOrganization).toBe("Amazon");
    expect(res.targetRole).toBe("SDE 2");
    expect(res.confidence).toBe("high");
  });

  it("handles fallback case Resume.pdf gracefully without throwing", () => {
    const res = parseResumeFilename("Resume.pdf");
    expect(res.candidateName).toBe("Candidate");
    expect(res.hiringOrganization).toBe("Unknown Hiring Organization");
    expect(res.targetRole).toBe("Unknown Target Role");
    expect(res.confidence).toBe("low");
  });

  it("handles single-token candidate filename Suresh.pdf", () => {
    const res = parseResumeFilename("Suresh.pdf");
    expect(res.candidateName).toBe("Suresh");
    expect(res.hiringOrganization).toBe("Unknown Hiring Organization");
    expect(res.targetRole).toBe("Unknown Target Role");
  });
});
