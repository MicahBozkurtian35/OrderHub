using Microsoft.AspNetCore.Mvc;

namespace BillingService.Controllers;

[ApiController]
// Support BOTH styles to prevent frontend 404s:
[Route("api/[controller]")]
[Route("[controller]")]
public class InvoicesController : ControllerBase
{
    private readonly IInvoiceStore _store;

    public InvoicesController(IInvoiceStore store) => _store = store;

    // GET /api/invoices  and  /invoices
    [HttpGet]
    public ActionResult<IEnumerable<InvoiceDto>> List([FromQuery] int take = 100)
        => Ok(_store.List(take));

    // GET /api/invoices/{id}  and  /invoices/{id}
    [HttpGet("{id:guid}")]
    public ActionResult<InvoiceDto> Get(Guid id)
        => _store.Get(id) is { } inv ? Ok(inv) : NotFound();

    // POST /api/invoices  and  /invoices
    [HttpPost]
    public ActionResult<InvoiceDto> Create([FromBody] CreateInvoiceDto req)
    {
        var inv = _store.Add(req);
        return Created($"/api/invoices/{inv.Id}", inv);
    }

    // POST /api/invoices/{id}/pay  and  /invoices/{id}/pay
    [HttpPost("{id:guid}/pay")]
    public ActionResult<InvoiceDto> Pay(Guid id)
        => _store.MarkPaid(id) is { } inv ? Ok(inv) : NotFound();
}
